/**
 * Memory Write Decider — determines if current turn contains info worth persisting.
 * Only writes for stable, reusable information. No transient data.
 * Deterministic pattern matching, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, MemoryWriteDecision } from "./context-types";

interface MemoryWriteInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
}

// Preference patterns — reusable user preferences
const PREFERENCE_PATTERNS = /(תזכרי ש|אני מעדיפ|אני אוהב|תמיד ת|כש.*תמיד|prefer|always)/i;

// Fact patterns — stable personal/contact facts
const FACT_PATTERNS = /(קוראים לי|השם שלי|אני גר ב|המייל שלי|הטלפון שלי|אני אבא של|אני אמא של|אני עובד ב|my name is|my email|i live in)/i;

// Relationship signal patterns
const RELATIONSHIP_PATTERNS = /(זה לקוח|הוא שותף|היא שותפה|הוא מהמשפחה|היא מהמשפחה|חבר טוב|חברה טובה|הוא לקוח|היא לקוחה)/i;

// Task signal patterns — recurring operational preferences
const TASK_SIGNAL_PATTERNS = /(תמיד כש|כל פעם ש|בכל חודש|כל שבוע|כל יום|מעכשיו תמיד)/i;

// Skip patterns — never write memory for these
const SKIP_PATTERNS = /^(היי|שלום|בוקר טוב|ערב טוב|מה קורה|תודה|סבבה|אוקיי|ok|thanks|hey|hello|hi|bye)\s*[!?.]*$/i;

/**
 * Decide whether information from this turn should be written to long-term memory.
 */
export function resolveMemoryWriteDecision(resolved: MemoryWriteInput): MemoryWriteDecision {
  const message = resolved.bundle.conversation.lastUserMessage;
  const trimmed = message.trim();

  // Skip greetings, simple questions, transient chat
  if (SKIP_PATTERNS.test(trimmed)) {
    return noWrite();
  }

  // Skip underspecified action requests — nothing stable to store
  if (resolved.actionPlan.needsClarification) {
    return noWrite();
  }

  // Skip very short messages (< 10 chars) — unlikely to contain stable info
  if (trimmed.length < 10) {
    return noWrite();
  }

  // 1. Preference
  if (PREFERENCE_PATTERNS.test(trimmed)) {
    return {
      type: "preference",
      shouldWrite: true,
      summary: "המשתמש שיתף העדפה קבועה",
      reason: "זוהתה העדפה שימושית לשיחות עתידיות",
      confidence: 0.9,
    };
  }

  // 2. Fact
  if (FACT_PATTERNS.test(trimmed)) {
    return {
      type: "fact",
      shouldWrite: true,
      summary: "המשתמש שיתף עובדה אישית",
      reason: "זוהתה עובדה יציבה לשמירה",
      confidence: 0.9,
    };
  }

  // 3. Relationship signal
  if (RELATIONSHIP_PATTERNS.test(trimmed)) {
    return {
      type: "relationship_signal",
      shouldWrite: true,
      summary: "זוהה סיגנל על סוג הקשר",
      reason: "מידע על קשר שיכול לשפר תקשורת עתידית",
      confidence: 0.85,
    };
  }

  // 4. Task signal
  if (TASK_SIGNAL_PATTERNS.test(trimmed)) {
    return {
      type: "task_signal",
      shouldWrite: true,
      summary: "זוהה דפוס עבודה חוזר",
      reason: "העדפה תפעולית שימושית לטווח ארוך",
      confidence: 0.85,
    };
  }

  return noWrite();
}

function noWrite(): MemoryWriteDecision {
  return {
    type: "none",
    shouldWrite: false,
    summary: "אין מה לשמור לזיכרון",
    reason: "לא זוהה מידע יציב או חשוב",
    confidence: 0.7,
  };
}
