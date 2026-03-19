/**
 * Memory Commit Policy — determines whether and how to write to memory.
 * Upgrades the simple shouldWrite boolean into a commit decision:
 * write_new, update_existing, skip, or reject_conflict.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, MemoryCommitDecision } from "./context-types";
import { getProfile } from "../relationship-memory/relationship-store";

type CommitInput = Omit<ResolvedContext, "memoryCommitDecision" | "conversationState" | "contradictions" | "responseStrategy" | "executionDecision" | "toolRoutingPolicy" | "compressedPrompt" | "outcomeEvaluation">;

// Patterns that indicate explicit owner memory instruction
const EXPLICIT_MEMORY_PATTERNS = /תזכרי ש|תזכור ש|תשמרי ש|תשמור ש|remember that/i;

/**
 * Resolve the memory commit decision based on write decision + existing state.
 */
export function resolveMemoryCommitDecision(resolved: CommitInput): MemoryCommitDecision {
  const { memoryWriteDecision, bundle } = resolved;

  // 1. If shouldWrite is false, skip
  if (!memoryWriteDecision.shouldWrite) {
    return {
      action: "skip",
      summary: "לא לשמור לזיכרון",
      reason: "לא זוהה מידע יציב או חשוב",
      confidence: 0.7,
    };
  }

  // Owner protection: skip unless explicit instruction
  if (bundle.person.isOwner && !EXPLICIT_MEMORY_PATTERNS.test(bundle.conversation.lastUserMessage)) {
    return {
      action: "skip",
      summary: "לא לשמור — בעלים בלי הוראה מפורשת",
      reason: "לבעלים לא שומרים אוטומטית אלא אם נאמר במפורש 'תזכרי ש...'",
      confidence: 0.8,
    };
  }

  const profile = getProfile(bundle.person.chatId);
  const existingNotes = profile?.notes || [];
  const message = bundle.conversation.lastUserMessage.toLowerCase().trim();

  // 2. Fact handling
  if (memoryWriteDecision.type === "fact") {
    // Check if a similar fact already exists in notes
    const similar = existingNotes.find((n) => hasSimilarContent(n, message));
    if (similar) {
      // Same value → skip
      if (isSameValue(similar, message)) {
        return {
          action: "skip",
          summary: "המידע כבר קיים",
          reason: `עובדה דומה כבר שמורה: "${similar.substring(0, 40)}"`,
          confidence: 0.85,
        };
      }
      // Different value → conflict
      return {
        action: "reject_conflict",
        summary: "מידע חדש סותר מידע קיים",
        reason: `קיים: "${similar.substring(0, 40)}" — חדש: "${message.substring(0, 40)}"`,
        confidence: 0.95,
        targetKey: "fact",
      };
    }
    return {
      action: "write_new",
      summary: "לשמור עובדה חדשה",
      reason: memoryWriteDecision.reason,
      confidence: 0.9,
      targetKey: "fact",
    };
  }

  // 3. Preference handling
  if (memoryWriteDecision.type === "preference") {
    const similar = existingNotes.find((n) => hasSimilarContent(n, message));
    if (similar) {
      return {
        action: "update_existing",
        summary: "לעדכן העדפה קיימת",
        reason: `עדכון ל: "${similar.substring(0, 40)}"`,
        confidence: 0.88,
        targetKey: "preference",
      };
    }
    return {
      action: "write_new",
      summary: "לשמור העדפה חדשה",
      reason: memoryWriteDecision.reason,
      confidence: 0.9,
      targetKey: "preference",
    };
  }

  // 4. Relationship signal handling
  if (memoryWriteDecision.type === "relationship_signal") {
    if (profile) {
      const currentType = profile.relationshipType;
      // If already classified the same way, skip
      if (currentType !== "unknown") {
        return {
          action: "skip",
          summary: "סוג קשר כבר מוגדר",
          reason: `סוג קשר נוכחי: ${currentType}`,
          confidence: 0.8,
        };
      }
      // Upgrade from unknown
      return {
        action: "update_existing",
        summary: "לשדרג סיווג קשר",
        reason: `שדרוג מ-unknown`,
        confidence: 0.88,
        targetKey: "relationship",
      };
    }
    return {
      action: "write_new",
      summary: "לשמור סיווג קשר חדש",
      reason: memoryWriteDecision.reason,
      confidence: 0.9,
      targetKey: "relationship",
    };
  }

  // 5. Task signal — only write if reusable
  if (memoryWriteDecision.type === "task_signal") {
    // Task signals tied to a single turn are not reusable
    const isReusable = message.length > 20 && (
      /תמיד/i.test(message) || /כל פעם/i.test(message) || /always/i.test(message)
    );
    if (!isReusable) {
      return {
        action: "skip",
        summary: "אות משימה חד-פעמי — לא לשמור",
        reason: "לא מספיק יציב או חוזר לשמירה",
        confidence: 0.75,
      };
    }
    return {
      action: "write_new",
      summary: "לשמור דפוס משימה חוזר",
      reason: memoryWriteDecision.reason,
      confidence: 0.85,
      targetKey: "task",
    };
  }

  // Default skip
  return {
    action: "skip",
    summary: "לא לשמור לזיכרון",
    reason: "סוג לא מזוהה",
    confidence: 0.7,
  };
}

/** Check if two text fragments share similar key content (simple heuristic). */
function hasSimilarContent(existing: string, newText: string): boolean {
  const existingLower = existing.toLowerCase();
  const newLower = newText.toLowerCase();

  // Extract key nouns/phrases: look for shared significant words (3+ chars)
  const existingWords = new Set(existingLower.split(/\s+/).filter((w) => w.length >= 3));
  const newWords = newLower.split(/\s+/).filter((w) => w.length >= 3);
  const overlap = newWords.filter((w) => existingWords.has(w)).length;

  // If more than 40% of new words overlap with existing, consider similar
  return newWords.length > 0 && overlap / newWords.length > 0.4;
}

/** Check if the values are essentially the same (very high overlap). */
function isSameValue(existing: string, newText: string): boolean {
  const existingLower = existing.toLowerCase().trim();
  const newLower = newText.toLowerCase().trim();

  if (existingLower === newLower) return true;

  // High overlap check
  const existingWords = new Set(existingLower.split(/\s+/).filter((w) => w.length >= 3));
  const newWords = newLower.split(/\s+/).filter((w) => w.length >= 3);
  const overlap = newWords.filter((w) => existingWords.has(w)).length;

  return newWords.length > 0 && overlap / newWords.length > 0.7;
}
