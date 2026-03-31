/**
 * Smart History Selector — picks the most relevant messages from conversation history.
 *
 * Instead of sending all 200 messages to Claude, selects a focused subset:
 * - Always includes recent messages (recency window)
 * - Always includes messages mentioning entities from current message
 * - Scores remaining messages by relevance (keyword overlap, decisions, names, dates)
 * - Returns top K messages sorted chronologically
 *
 * Fully deterministic — no AI calls.
 */
import type { ConversationMessage } from "../stores/types";

/** Configuration */
const RECENCY_WINDOW = 20;          // Always include last N messages
const MAX_SELECTED = 60;            // Maximum messages to return
const MIN_MESSAGES_TO_FILTER = 30;  // Don't filter if history is already small

/** Hebrew action verbs that indicate decisions/commitments */
const DECISION_PATTERN = /שלחתי|קבעתי|הזמנתי|ביטלתי|סיכמנו|החלטנו|הסכמנו|אישרתי|ביצעתי|שמרתי|יצרתי|הוספתי|מחקתי|עדכנתי|הגדרתי|בוצע|אושר|נקבע|הוחלט/;

/** Date/time patterns that indicate scheduling context */
const DATE_PATTERN = /\d{1,2}[./]\d{1,2}|\d{1,2}:\d{2}|יום [א-ש]|בשעה|מחר|אתמול|השבוע|החודש|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר/i;

/** Tool use markers (from Claude's tool_use responses stored as text) */
const TOOL_MARKER_PATTERN = /\[tool:|הפעלתי|בדקתי ביומן|שלחתי הודעה|חיפשתי|יצרתי אירוע/;

/**
 * Extract keywords from a message for relevance scoring.
 * Filters out very short/common words (Hebrew stopwords).
 */
function extractKeywords(text: string): Set<string> {
  const stopwords = new Set([
    "את", "של", "על", "עם", "אל", "מה", "איך", "למה", "כי", "אם", "גם",
    "לא", "כן", "אני", "הוא", "היא", "זה", "זו", "או", "רק", "עוד",
    "יש", "אין", "היה", "הם", "הן", "שלי", "שלך", "שלו", "שלה",
    "אבל", "בגלל", "כמו", "בין", "לפני", "אחרי", "תודה", "בבקשה",
    "the", "is", "a", "an", "to", "and", "or", "in", "on", "at", "for",
    "it", "this", "that", "you", "we", "he", "she", "not", "but",
  ]);

  const words = text.toLowerCase().split(/[\s,.:;!?()[\]{}'"\/\\-]+/);
  const keywords = new Set<string>();
  for (const word of words) {
    if (word.length >= 2 && !stopwords.has(word)) {
      keywords.add(word);
    }
  }
  return keywords;
}

/**
 * Score a message's relevance to the current query.
 * Higher score = more relevant.
 */
function scoreMessage(
  msg: ConversationMessage,
  index: number,
  totalMessages: number,
  queryKeywords: Set<string>,
  mentionedEntities: string[],
): number {
  let score = 0;
  const content = msg.content.toLowerCase();

  // 1. Keyword overlap with current message (0-10 points)
  let keywordHits = 0;
  for (const kw of queryKeywords) {
    if (content.includes(kw)) keywordHits++;
  }
  score += Math.min(keywordHits * 2, 10);

  // 2. Contains mentioned entities (5 points per entity)
  for (const entity of mentionedEntities) {
    if (content.includes(entity.toLowerCase())) {
      score += 5;
    }
  }

  // 3. Contains decisions/commitments (3 points)
  if (DECISION_PATTERN.test(msg.content)) {
    score += 3;
  }

  // 4. Contains dates/times (2 points — scheduling context)
  if (DATE_PATTERN.test(msg.content)) {
    score += 2;
  }

  // 5. Contains tool markers (2 points — action was taken)
  if (TOOL_MARKER_PATTERN.test(msg.content)) {
    score += 2;
  }

  // 6. Recency decay — exponential decay from most recent
  const age = totalMessages - index; // 1 = most recent, totalMessages = oldest
  const recencyBonus = Math.max(0, 5 * Math.exp(-age / 40));
  score += recencyBonus;

  // 7. Assistant messages get slight boost (they contain structured info)
  if (msg.role === "assistant") {
    score += 1;
  }

  // 8. Longer messages likely contain more context (small bonus)
  if (msg.content.length > 100) {
    score += 1;
  }

  return score;
}

/**
 * Select the most relevant messages from conversation history.
 *
 * @param history - Full conversation history from store
 * @param currentMessage - The current user message
 * @param mentionedEntities - Entities extracted by turn intent classifier
 * @returns Filtered history, sorted chronologically (same order as input)
 */
export function selectRelevantHistory(
  history: ConversationMessage[],
  currentMessage: string,
  mentionedEntities: string[] = [],
): ConversationMessage[] {
  // Don't filter small histories
  if (history.length <= MIN_MESSAGES_TO_FILTER) {
    return history;
  }

  const queryKeywords = extractKeywords(currentMessage);
  const totalMessages = history.length;

  // Always include the recency window (last N messages)
  const recencyStart = Math.max(0, totalMessages - RECENCY_WINDOW);
  const selectedIndices = new Set<number>();

  for (let i = recencyStart; i < totalMessages; i++) {
    selectedIndices.add(i);
  }

  // Score all messages outside the recency window
  const scoredMessages: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < recencyStart; i++) {
    const score = scoreMessage(history[i], i, totalMessages, queryKeywords, mentionedEntities);
    scoredMessages.push({ index: i, score });
  }

  // Sort by score descending
  scoredMessages.sort((a, b) => b.score - a.score);

  // Select top messages until we hit MAX_SELECTED
  const remaining = MAX_SELECTED - selectedIndices.size;
  for (let i = 0; i < Math.min(remaining, scoredMessages.length); i++) {
    // Only include messages with a minimum score threshold
    if (scoredMessages[i].score >= 2) {
      selectedIndices.add(scoredMessages[i].index);
    }
  }

  // Ensure paired messages stay together (user question + assistant answer)
  const pairedIndices = new Set<number>();
  for (const idx of selectedIndices) {
    pairedIndices.add(idx);
    // If this is a user message, include the next assistant response
    if (history[idx].role === "user" && idx + 1 < totalMessages && !selectedIndices.has(idx + 1)) {
      pairedIndices.add(idx + 1);
    }
    // If this is an assistant message, include the preceding user message
    if (history[idx].role === "assistant" && idx > 0 && !selectedIndices.has(idx - 1)) {
      pairedIndices.add(idx - 1);
    }
  }

  // Build final selection, sorted chronologically
  const sortedIndices = Array.from(pairedIndices).sort((a, b) => a - b);
  const selected = sortedIndices.map((i) => history[i]);

  const dropped = totalMessages - selected.length;
  if (dropped > 0) {
    console.log(`[history-selector] Selected ${selected.length}/${totalMessages} messages (dropped ${dropped} low-relevance)`);
  }

  return selected;
}
