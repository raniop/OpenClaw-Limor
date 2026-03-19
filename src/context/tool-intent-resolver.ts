/**
 * Tool Intent Resolver — determines if this turn likely needs a tool call.
 * Deterministic pattern matching, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, ToolIntent } from "./context-types";

interface ToolIntentInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
}

const MESSAGING_VERBS = /(תשלחי|תכתבי|תגידי\s+ל|תעני\s+ל|send\b)/i;
const CALENDAR_PATTERNS = /(תקבעי|תתאמי|ביומן|פגישה|זימון|calendar|meeting)/i;
const BOOKING_PATTERNS = /(מסעדה|להזמין מקום|שולחן|booking|book restaurant)/i;
const TRAVEL_PATTERNS = /(טיסה|מלון|חופשה|flight|hotel)/i;
const CRM_PATTERNS = /(פוליסה|ביטוח|לקוח|crm|policy|insurance)/i;
const FILE_PATTERNS = /(קובץ|מסמך|לשמור|למחוק קובץ|file|document)/i;
const CONTACT_PATTERNS = /(איש קשר|מספר של|טלפון של|contact)/i;
const CAPABILITY_PATTERNS = /(תלמדי|תלמד|capability|יכולת חדשה)/i;

/**
 * Resolve whether a tool is likely needed based on message content and context.
 */
export function resolveToolIntent(resolved: ToolIntentInput): ToolIntent {
  const message = resolved.bundle.conversation.lastUserMessage;
  const needsClarification = resolved.actionPlan.needsClarification;

  // Check each tool category in priority order
  const match = matchToolCategory(message);

  if (!match) {
    return {
      type: "none",
      shouldUseTool: false,
      summary: "אין צורך בכלי",
      reason: "אפשר לענות ישירות",
      confidence: 0.7,
    };
  }

  // Blocking rule: if clarification is needed, don't use tool yet
  if (needsClarification) {
    return {
      type: match.type,
      shouldUseTool: false,
      summary: `כלי ${match.label} עשוי להיות נדרש, אבל קודם צריך הבהרה`,
      reason: "חסרים פרטים לפני שאפשר להפעיל כלי",
      confidence: 0.85,
    };
  }

  return {
    type: match.type,
    shouldUseTool: true,
    summary: `סביר שנדרש כלי ${match.label}`,
    reason: match.reason,
    confidence: match.confidence,
  };
}

interface ToolMatch {
  type: ToolIntent["type"];
  label: string;
  reason: string;
  confidence: number;
}

function matchToolCategory(message: string): ToolMatch | null {
  if (MESSAGING_VERBS.test(message)) {
    return { type: "messaging", label: "שליחת הודעה", reason: "יש בקשת שליחה", confidence: 0.9 };
  }
  if (CALENDAR_PATTERNS.test(message)) {
    return { type: "calendar", label: "יומן", reason: "יש בקשת תיאום או פגישה", confidence: 0.9 };
  }
  if (BOOKING_PATTERNS.test(message)) {
    return { type: "booking", label: "הזמנת מקום", reason: "יש בקשת הזמנה", confidence: 0.9 };
  }
  if (TRAVEL_PATTERNS.test(message)) {
    return { type: "travel", label: "נסיעות", reason: "יש בקשת טיסה או מלון", confidence: 0.85 };
  }
  if (CRM_PATTERNS.test(message)) {
    return { type: "crm", label: "CRM", reason: "יש שאלה על פוליסה או לקוח", confidence: 0.9 };
  }
  if (FILE_PATTERNS.test(message)) {
    return { type: "file", label: "קבצים", reason: "יש בקשה הקשורה לקבצים", confidence: 0.85 };
  }
  if (CONTACT_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "אנשי קשר", reason: "יש בקשת חיפוש איש קשר", confidence: 0.85 };
  }
  if (CAPABILITY_PATTERNS.test(message)) {
    return { type: "capability", label: "יכולות", reason: "יש בקשת יכולת חדשה", confidence: 0.85 };
  }
  return null;
}
