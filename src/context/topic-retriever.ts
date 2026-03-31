/**
 * Topic Retriever — finds relevant past conversation segments for context injection.
 *
 * Deterministic keyword-based scoring against stored topic segments.
 * No AI calls — fast enough to run on every message.
 */
import { getDb } from "../stores/sqlite-init";

interface StoredSegment {
  id: number;
  chat_id: string;
  topic: string;
  summary: string;
  key_details: string | null;
  started_at: string;
  message_count: number;
}

export interface RelevantSegment {
  topic: string;
  summary: string;
  keyDetails?: Record<string, string[]>;
  date: string;
  score: number;
}

/** Hebrew stopwords to skip during keyword matching */
const STOPWORDS = new Set([
  "את", "של", "על", "עם", "אל", "מה", "איך", "למה", "כי", "אם", "גם",
  "לא", "כן", "אני", "הוא", "היא", "זה", "זו", "או", "רק", "עוד",
  "יש", "אין", "היה", "הם", "הן", "שלי", "שלך", "שלו", "שלה",
  "אבל", "בגלל", "כמו", "בין", "לפני", "אחרי", "תודה", "בבקשה",
  "the", "is", "a", "to", "and", "or", "in", "on", "at", "for",
]);

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .split(/[\s,.:;!?()[\]{}'"\/\\-]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Score a stored segment against the current message.
 */
function scoreSegment(segment: StoredSegment, queryKeywords: string[]): number {
  let score = 0;
  const topicLower = segment.topic.toLowerCase();
  const summaryLower = segment.summary.toLowerCase();

  for (const kw of queryKeywords) {
    // Topic match is strongest signal (3 points)
    if (topicLower.includes(kw)) score += 3;
    // Summary match (2 points)
    if (summaryLower.includes(kw)) score += 2;
    // Key details match (2 points)
    if (segment.key_details?.toLowerCase().includes(kw)) score += 2;
  }

  // Recency bonus — newer segments get a small boost
  const ageHours = (Date.now() - new Date(segment.started_at).getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) score += 3;       // last 24 hours
  else if (ageHours < 72) score += 2;  // last 3 days
  else if (ageHours < 168) score += 1; // last week

  return score;
}

/**
 * Retrieve the most relevant topic segments for a given chat and message.
 *
 * @param chatId - The chat to search segments for
 * @param currentMessage - The current user message
 * @param limit - Maximum number of segments to return (default: 3)
 * @returns Formatted string for context injection, or null if no relevant segments
 */
export function getRelevantTopicSegments(
  chatId: string,
  currentMessage: string,
  limit: number = 3,
): string | null {
  const db = getDb();
  const segments = db.prepare(
    "SELECT id, chat_id, topic, summary, key_details, started_at, message_count FROM topic_segments WHERE chat_id = ? ORDER BY id DESC LIMIT 100"
  ).all(chatId) as StoredSegment[];

  if (segments.length === 0) return null;

  const queryKeywords = extractKeywords(currentMessage);
  if (queryKeywords.length === 0) return null;

  // Score all segments
  const scored: Array<{ segment: StoredSegment; score: number }> = segments
    .map((seg) => ({ segment: seg, score: scoreSegment(seg, queryKeywords) }))
    .filter((s) => s.score >= 4) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // Format top segments
  const topSegments = scored.slice(0, limit);
  const lines = topSegments.map((s) => {
    const date = new Date(s.segment.started_at).toLocaleDateString("he-IL");
    let line = `• ${s.segment.topic} (${date}): ${s.segment.summary}`;

    // Add key details if present
    if (s.segment.key_details) {
      try {
        const details = JSON.parse(s.segment.key_details);
        const extras: string[] = [];
        if (details.decisions?.length) extras.push(`החלטות: ${details.decisions.join(", ")}`);
        if (details.commitments?.length) extras.push(`התחייבויות: ${details.commitments.join(", ")}`);
        if (extras.length) line += ` [${extras.join(" | ")}]`;
      } catch {}
    }

    return line;
  });

  return `📚 שיחות קודמות רלוונטיות:\n${lines.join("\n")}`;
}

/**
 * Get all topic segments for a chat (for debugging/dashboard).
 */
export function getAllTopicSegments(chatId: string): RelevantSegment[] {
  const db = getDb();
  const segments = db.prepare(
    "SELECT topic, summary, key_details, started_at FROM topic_segments WHERE chat_id = ? ORDER BY id DESC LIMIT 50"
  ).all(chatId) as Array<{ topic: string; summary: string; key_details: string | null; started_at: string }>;

  return segments.map((s) => ({
    topic: s.topic,
    summary: s.summary,
    keyDetails: s.key_details ? JSON.parse(s.key_details) : undefined,
    date: s.started_at,
    score: 0,
  }));
}
