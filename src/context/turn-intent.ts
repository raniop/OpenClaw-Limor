/**
 * Turn Intent Classifier — regex-based classification of incoming messages.
 * Deterministic, no AI calls, fast.
 */
import type { TurnIntent } from "./context-types";
import { findContactByName } from "../contacts";

// Minimal messages: "?", "!", "...", single character
const MINIMAL_PATTERN = /^[?!.…·\-\s]{1,5}$/;

// Greeting patterns (Hebrew + English)
const GREETING_PATTERN = /^(היי|שלום|בוקר טוב|ערב טוב|מה קורה|מה נשמע|אהלן|hey|hi|hello|good morning)/i;

// Status/overview queries
const STATUS_PATTERN = /(מה הסטטוס|מה פתוח|מה ממתין|סטטוס|תעדכני|עדכון|סיכום|status|what.?s pending|update me)/i;

// Correction intent — user is fixing something
const CORRECTION_PATTERN = /^(לא[,.\s]|תשני|תתקני|תעדכני|תחליפי|לא נכון|טעות|fix|change|update|not that|wrong)/i;

// Followup query — asking about pending items
const FOLLOWUP_PATTERN = /(מה עם|מה לגבי|עדכון על|נושא של|טיפלת|עשית|סידרת|what about|did you|have you)/i;

// Reminder request
const REMINDER_PATTERN = /(תזכירי|תזכרי|אל תשכחי|remind|תזכורת|לזכור|תרשמי|רשמי לי)/i;

// Action request — asking Limor to do something
const ACTION_PATTERN = /(תשלחי|תקבעי|תבדקי|תחפשי|תעשי|תמצאי|תזמיני|send|book|check|search|do|find)/i;

/**
 * Classify the intent of an incoming message.
 * Returns category, confidence, mentioned entities, and minimal flag.
 */
export function classifyTurnIntent(message: string): TurnIntent {
  const trimmed = message.trim();
  const mentionedEntities = extractEntities(trimmed);
  const isMinimal = MINIMAL_PATTERN.test(trimmed) || trimmed.length <= 3;

  // Minimal messages like "?" — likely continuation/follow-up on previous context
  if (isMinimal) {
    return { category: "continuation", confidence: 0.7, mentionedEntities, isMinimal: true };
  }

  // Greeting
  if (GREETING_PATTERN.test(trimmed)) {
    return { category: "greeting", confidence: 0.9, mentionedEntities, isMinimal: false };
  }

  // Correction — check before other intents
  if (CORRECTION_PATTERN.test(trimmed)) {
    return { category: "correction", confidence: 0.85, mentionedEntities, isMinimal: false };
  }

  // Status query
  if (STATUS_PATTERN.test(trimmed)) {
    return { category: "status_query", confidence: 0.9, mentionedEntities, isMinimal: false };
  }

  // Reminder request
  if (REMINDER_PATTERN.test(trimmed)) {
    return { category: "reminder_request", confidence: 0.9, mentionedEntities, isMinimal: false };
  }

  // Followup query
  if (FOLLOWUP_PATTERN.test(trimmed)) {
    return { category: "followup_query", confidence: 0.8, mentionedEntities, isMinimal: false };
  }

  // Action request
  if (ACTION_PATTERN.test(trimmed)) {
    return { category: "action_request", confidence: 0.8, mentionedEntities, isMinimal: false };
  }

  // Any question mark → general question
  if (/\?/.test(trimmed)) {
    return { category: "question", confidence: 0.7, mentionedEntities, isMinimal: false };
  }

  return { category: "unclear", confidence: 0.5, mentionedEntities, isMinimal: false };
}

/**
 * Extract entity names mentioned in the message by matching against known contacts.
 */
function extractEntities(text: string): string[] {
  const entities: string[] = [];
  // Split into words and try to find contact matches
  const words = text.split(/\s+/);

  for (const word of words) {
    const clean = word.replace(/[^a-zA-Zא-ת\u0590-\u05FF]/g, "");
    if (clean.length < 2) continue;

    const contact = findContactByName(clean);
    if (contact) {
      entities.push(contact.name);
    }
  }

  // Also try multi-word names (2 consecutive words)
  for (let i = 0; i < words.length - 1; i++) {
    const twoWords = words[i].replace(/[^a-zA-Zא-ת\u0590-\u05FF\s]/g, "") + " " +
      words[i + 1].replace(/[^a-zA-Zא-ת\u0590-\u05FF\s]/g, "");
    if (twoWords.length >= 4) {
      const contact = findContactByName(twoWords.trim());
      if (contact) {
        entities.push(contact.name);
      }
    }
  }

  return [...new Set(entities)];
}
