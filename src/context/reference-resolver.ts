/**
 * Reference Resolver — determines who/what the user is likely referring to.
 * Uses mentioned entities, open loops, topic segments, memory, and pronoun patterns.
 * Deterministic, no AI calls.
 */
import type { ResolvedReference, OpenLoopContext, ConversationContext, PersonContext } from "./context-types";
import { getDb } from "../stores/sqlite-init";

// Hebrew pronoun patterns that indicate implicit person references
const PRONOUN_PERSON_PATTERNS = /(^|\s)(לו|לה|אותו|אותה|איתו|איתה|עליו|עליה|ממנו|ממנה|שלו|שלה)(\s|$|[?.!,])/;

// Patterns that indicate "this thing" — referencing an open item
const THING_PATTERNS = /(^|\s)(את זה|על זה|בזה|לזה|מזה|זהו|הזה|תבדקי את זה|תטפלי בזה)(\s|$|[?.!,])/;

// Patterns referencing past conversations ("what we talked about", "last time")
const PAST_CONVERSATION_PATTERNS = /(מה שדיברנו|על מה דיברנו|דיברנו על|זוכרת ש|הפעם הקודמת|מה שסיכמנו|מה שהחלטנו|כמו שאמרת|כמו שאמרתי|שיחה הקודמת|דיברנו עליו|הנושא ההוא)/;

// Temporal reference patterns
const TEMPORAL_PATTERNS = /(אתמול|שלשום|אמש|בשבוע שעבר|בחודש שעבר|לפני כמה ימים|ביום [א-ש]|אתמול בערב|הבוקר)/;

// "The X" patterns — referencing a specific entity from memory (the restaurant, the flight, etc.)
const THE_X_PATTERNS = /(המסעדה|הטיסה|המלון|הפגישה|ההזמנה|המשלוח|הטיול|החשבון|הפרויקט|המקום)(\s+ש|\s+ה|\s+מ|\s*$)/;

export function resolveReferences(
  message: string,
  input: {
    mentionedEntities: string[];
    openLoops: OpenLoopContext;
    conversation: ConversationContext;
    person: PersonContext;
  }
): ResolvedReference[] {
  const refs: ResolvedReference[] = [];
  const trimmed = message.trim();

  // 1. Explicit entity mentions — highest confidence
  for (const entity of input.mentionedEntities) {
    refs.push({
      kind: "person",
      displayName: entity,
      source: "mentioned_entity",
      confidence: 0.95,
    });
  }

  // 2. Pronoun-style person references — resolve from open loops
  if (PRONOUN_PERSON_PATTERNS.test(trimmed) && refs.length === 0) {
    // Try pending meeting requester first
    if (input.openLoops.pendingMeeting?.requesterName) {
      refs.push({
        kind: "person",
        displayName: input.openLoops.pendingMeeting.requesterName,
        source: "open_loop",
        confidence: 0.8,
      });
    }
    // Then try followup requesters
    else {
      for (const fu of input.openLoops.followups) {
        if (fu.requesterName) {
          refs.push({
            kind: "person",
            displayName: fu.requesterName,
            source: "open_loop",
            confidence: 0.75,
          });
          break; // most recent first
        }
      }
    }
  }

  // 3. "This thing" references — resolve to open followup
  if (THING_PATTERNS.test(trimmed) && input.openLoops.followups.length > 0) {
    const topFollowup = input.openLoops.followups[0];
    refs.push({
      kind: "followup",
      displayName: topFollowup.reason.substring(0, 60),
      source: "open_loop",
      confidence: 0.75,
    });
  }

  // 4. Past conversation references — resolve from topic segments
  if (PAST_CONVERSATION_PATTERNS.test(trimmed)) {
    const topicRef = resolveFromTopicSegments(input.person.chatId, trimmed);
    if (topicRef) {
      refs.push(topicRef);
    }
  }

  // 5. Temporal references ("yesterday", "last week") — find topic segments by time
  if (TEMPORAL_PATTERNS.test(trimmed)) {
    const temporalRef = resolveTemporalReference(input.person.chatId, trimmed);
    if (temporalRef) {
      refs.push(temporalRef);
    }
  }

  // 6. "The X" references — look for specific entities in recent topic segments
  const theXMatch = trimmed.match(THE_X_PATTERNS);
  if (theXMatch) {
    const entityType = theXMatch[1]; // e.g., "המסעדה"
    const entityRef = resolveEntityFromSegments(input.person.chatId, entityType);
    if (entityRef) {
      refs.push(entityRef);
    }
  }

  return refs;
}

/**
 * Resolve a "what we talked about" reference from stored topic segments.
 */
function resolveFromTopicSegments(chatId: string, message: string): ResolvedReference | null {
  try {
    const db = getDb();
    // Get the most recent topic segments
    const segments = db.prepare(
      "SELECT topic, summary FROM topic_segments WHERE chat_id = ? ORDER BY id DESC LIMIT 5"
    ).all(chatId) as Array<{ topic: string; summary: string }>;

    if (segments.length === 0) return null;

    // Extract keywords from the message to find the best matching segment
    const words = message.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    let bestSegment = segments[0]; // default to most recent
    let bestScore = 0;

    for (const seg of segments) {
      const topicLower = seg.topic.toLowerCase();
      const summaryLower = seg.summary.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (topicLower.includes(w)) score += 3;
        if (summaryLower.includes(w)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSegment = seg;
      }
    }

    return {
      kind: "topic",
      displayName: `${bestSegment.topic}: ${bestSegment.summary.substring(0, 80)}`,
      source: "topic_segment",
      confidence: bestScore > 0 ? 0.8 : 0.6,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a temporal reference ("yesterday", "last week") to a topic segment.
 */
function resolveTemporalReference(chatId: string, message: string): ResolvedReference | null {
  try {
    const db = getDb();
    const now = new Date();
    let lookbackHours = 24; // default: last 24h

    if (/שלשום|אמש/.test(message)) lookbackHours = 72;
    if (/בשבוע שעבר/.test(message)) lookbackHours = 168;
    if (/בחודש שעבר/.test(message)) lookbackHours = 744; // ~31 days
    if (/לפני כמה ימים/.test(message)) lookbackHours = 120; // ~5 days

    const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();

    const segment = db.prepare(
      "SELECT topic, summary FROM topic_segments WHERE chat_id = ? AND started_at >= ? ORDER BY id DESC LIMIT 1"
    ).get(chatId, cutoff) as { topic: string; summary: string } | undefined;

    if (!segment) return null;

    return {
      kind: "topic",
      displayName: `${segment.topic}: ${segment.summary.substring(0, 80)}`,
      source: "topic_segment",
      confidence: 0.7,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a "the X" reference (e.g., "the restaurant") from topic segments.
 */
function resolveEntityFromSegments(chatId: string, entityType: string): ResolvedReference | null {
  try {
    const db = getDb();
    // Map Hebrew entity types to search keywords
    const searchTerm = entityType.replace(/^ה/, ""); // Remove the "ה" prefix

    const segment = db.prepare(
      "SELECT topic, summary, key_details FROM topic_segments WHERE chat_id = ? AND (topic LIKE ? OR summary LIKE ? OR key_details LIKE ?) ORDER BY id DESC LIMIT 1"
    ).get(chatId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`) as { topic: string; summary: string; key_details: string | null } | undefined;

    if (!segment) return null;

    // Try to extract specific entity from key_details
    let displayName = `${segment.topic}: ${segment.summary.substring(0, 60)}`;
    if (segment.key_details) {
      try {
        const details = JSON.parse(segment.key_details);
        // Look for relevant specifics
        if (details.decisions?.length) displayName += ` (${details.decisions[0]})`;
      } catch {}
    }

    return {
      kind: "topic",
      displayName,
      source: "topic_segment",
      confidence: 0.75,
    };
  } catch {
    return null;
  }
}
