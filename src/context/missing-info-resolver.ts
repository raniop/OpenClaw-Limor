/**
 * Missing Info Resolver — identifies what specific details are missing from a request.
 * Deterministic heuristics, no AI calls.
 */
import type { MissingInfo, MissingDetailType, TurnIntent, ResolvedReference } from "./context-types";

// Sending/contact verbs
const SEND_VERBS = /(תשלחי|תכתבי|תגידי|תעדכני|תעני|send)/i;
// Scheduling verbs
const SCHEDULE_VERBS = /(תקבעי|תתאמי|תכניסי לי|schedule|book)/i;
// Action verbs needing a target object
const TARGET_VERBS = /(תבדקי|תחפשי|תטפלי|תסדרי)/i;

// Date/time markers
const DATE_MARKERS = /(היום|מחר|מחרתיים|יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|בשבוע הבא|\d{1,2}[./]\d{1,2})/i;
const TIME_MARKERS = /(\d{1,2}:\d{2}|בבוקר|בצהריים|אחה"צ|בערב|בלילה|ב-?\d{1,2}:?\d{0,2})/i;

// Explicit target phrases (if present, recipient is not missing)
const EXPLICIT_TARGET = /(ל[א-ת]{2,}|to\s+\w+)/i;

export function resolveMissingInfo(
  message: string,
  turnIntent: TurnIntent,
  references: ResolvedReference[]
): MissingInfo {
  // Only evaluate for action/reminder requests
  if (turnIntent.category !== "action_request" && turnIntent.category !== "reminder_request") {
    return { missing: ["none"], summary: "לא חסר מידע מהותי", confidence: 0.7 };
  }

  const trimmed = message.trim();
  const missing: MissingDetailType[] = [];
  const hasPersonRef = references.some((r) => r.kind === "person");

  // 1. Recipient missing
  if (SEND_VERBS.test(trimmed) && !hasPersonRef && !hasExplicitTarget(trimmed)) {
    missing.push("recipient");
  }

  // 2. Date/time missing for scheduling
  if (SCHEDULE_VERBS.test(trimmed)) {
    if (!DATE_MARKERS.test(trimmed)) {
      missing.push("date");
    }
    if (!TIME_MARKERS.test(trimmed)) {
      missing.push("time");
    }
    // Topic missing — generic scheduling with no subject
    if (isGenericSchedule(trimmed)) {
      missing.push("topic");
    }
  }

  // 3. Target object missing for action verbs
  if (TARGET_VERBS.test(trimmed)) {
    const hasFollowupRef = references.some((r) => r.kind === "followup");
    if (!hasFollowupRef && isShortAction(trimmed)) {
      missing.push("target_object");
    }
  }

  if (missing.length === 0) {
    return { missing: ["none"], summary: "לא חסר מידע מהותי", confidence: 0.7 };
  }

  const DETAIL_LABELS: Record<MissingDetailType, string> = {
    recipient: "נמען",
    subject: "נושא",
    time: "שעה",
    date: "תאריך",
    topic: "נושא",
    target_object: "מטרה",
    none: "",
  };

  const summary = missing.length === 1
    ? `חסר פרט: ${DETAIL_LABELS[missing[0]]}`
    : "חסרים פרטים להשלמת הבקשה";

  const confidence = missing.length === 1 ? 0.85 : 0.9;

  return { missing, summary, confidence };
}

/**
 * Check if message has an explicit named target after a preposition.
 * e.g., "לעמית", "לאייל", "לרני"
 */
function hasExplicitTarget(message: string): boolean {
  // Look for standalone "ל" + Hebrew name (2+ chars, not a pronoun) at word boundary
  const pronouns = new Set(["לו", "לה", "לי", "לך", "לנו", "לכם", "להם", "להן"]);
  // Split by spaces and check each word starting with "ל"
  const words = message.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[^א-ת]/g, "");
    if (clean.startsWith("ל") && clean.length >= 3 && !pronouns.has(clean)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if scheduling request is generic (no topic/subject after verb).
 * e.g., "תקבעי לי" vs "תקבעי לי פגישה עם עמית"
 */
function isGenericSchedule(message: string): boolean {
  const words = message.trim().split(/\s+/);
  // If message is very short after the verb, it's likely generic
  return words.length <= 3;
}

/**
 * Check if action message is too short to have a meaningful target.
 */
function isShortAction(message: string): boolean {
  const words = message.trim().split(/\s+/);
  return words.length <= 3;
}
