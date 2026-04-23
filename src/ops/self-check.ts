/**
 * Self-Check — בדיקה עצמית דטרמיניסטית אחרי כל תשובת AI.
 * מבוססת על flags בוליאניים — ללא קריאות AI.
 */
import type { OperationalTrace } from "./operational-trace";
import { ACTION_CLAIM_PATTERN } from "../ai/action-claim-pattern";

// --- Types ---

export type SelfCheckFlag =
  | "action_claimed_not_executed"   // AI טענה שביצעה פעולה אבל לא הופעל כלי
  | "tool_intended_not_used"        // tool intent זוהה אבל לא הופעל כלי
  | "unnecessary_tool_used"         // הופעל כלי כשה-intent היה "none"
  | "open_loop_unaddressed"         // followup שעבר הזמן לא הוזכר
  | "missing_info_unresolved"       // חסר מידע שלא נשאל עליו
  | "contradiction_unresolved"      // סתירה שלא טופלה
  | "followup_needed"               // התוצאה מחייבת followup
  | "memory_write_skipped"          // היה צריך לכתוב לזיכרון אבל לא נכתב
  | "recovery_needed"               // כשל שדורש התאוששות
  | "pending_state_unresolved"      // מצב pending (אישור/פגישה) לא טופל
  | "response_too_long"             // תשובה > 500 תווים לשאילתה פשוטה
  | "response_empty";               // תשובה ריקה או כמעט ריקה

export interface SelfCheckResult {
  flags: SelfCheckFlag[];
  alertLevel: "ok" | "warning" | "critical";
  summary: string;
}

// --- Hallucination regex — תבניות של טענת ביצוע פעולה ---

const ACTION_CLAIM_PATTERNS = ACTION_CLAIM_PATTERN;

// --- Followup mention patterns ---

const FOLLOWUP_MENTION_PATTERNS = /תזכורת|followup|פולואפ|לחזור|להתקשר|לטפל ב|טיפלנו|עדכון|דחוף|עבר הזמן/i;

// --- Clarification patterns ---

const CLARIFICATION_PATTERNS = /מה בדיוק|למי|מתי|לאיפה|איזה|תוכל להבהיר|תוכלי להבהיר|אני צריכה|אני צריך.*פרטים|מה התאריך|מה השעה/;

// --- Contradiction resolution patterns ---

const CONTRADICTION_PATTERNS = /שימי לב|רגע|לא בטוח|יש סתירה|אולי התכוונת|בוא נבהיר/;

// --- Pending state patterns ---

const PENDING_MENTION_PATTERNS = /ממתין|מחכה|אישור|pending|בקשה.*אישור|פגישה.*מחכה/;

/**
 * מריץ את ה-self-check הדטרמיניסטי.
 * @param trace - ה-operational trace (כולל ערכי context engine)
 * @param aiResponse - הטקסט שה-AI החזירה
 * @param toolCallsMade - שמות הכלים שהופעלו בפועל
 */
export function runSelfCheck(
  trace: OperationalTrace,
  aiResponse: string,
  toolCallsMade: string[]
): SelfCheckResult {
  const flags: SelfCheckFlag[] = [];

  // 1. action_claimed_not_executed — AI טענה שעשתה משהו בלי כלי
  if (toolCallsMade.length === 0 && ACTION_CLAIM_PATTERNS.test(aiResponse)) {
    flags.push("action_claimed_not_executed");
  }

  // 2. tool_intended_not_used — tool intent זוהה אבל אף כלי לא הופעל
  if (trace.toolIntentType !== "none" && trace.shouldUseTool && toolCallsMade.length === 0) {
    flags.push("tool_intended_not_used");
  }

  // 3. unnecessary_tool_used — הופעל כלי כשלא היה intent
  // Only flag if the tools used are truly irrelevant (e.g., not standard info-gathering tools)
  const ALWAYS_OK_TOOLS = new Set(["learn_instruction", "forget_instruction", "list_instructions", "get_group_history", "summarize_group_activity", "get_contact_history", "list_contacts", "web_search", "list_events", "read_sms", "search_sms", "smart_home_status", "smart_home_list", "list_files", "read_file", "get_current_model"]);
  if (trace.toolIntentType === "none" && !trace.shouldUseTool && toolCallsMade.length > 0) {
    const allToolsOk = toolCallsMade.every((t) => ALWAYS_OK_TOOLS.has(t));
    if (!allToolsOk) {
      flags.push("unnecessary_tool_used");
    }
  }

  // 4. open_loop_unaddressed — followup שעבר הזמן ולא הוזכר
  if (trace.openLoopsOverdue > 0 && !FOLLOWUP_MENTION_PATTERNS.test(aiResponse)) {
    flags.push("open_loop_unaddressed");
  }

  // 5. missing_info_unresolved — חסר מידע שלא נשאל עליו
  const hasMissingInfo = trace.detectedMissingInfo.length > 0 &&
    !trace.detectedMissingInfo.every((m) => m === "none");
  if (hasMissingInfo && trace.needsClarification && !CLARIFICATION_PATTERNS.test(aiResponse)) {
    flags.push("missing_info_unresolved");
  }

  // 6. contradiction_unresolved — סתירה זוהתה ולא טופלה
  const hasRealContradictions = trace.contradictionFlags.length > 0 &&
    !trace.contradictionFlags.every((c) => c === "none");
  if (hasRealContradictions && !CONTRADICTION_PATTERNS.test(aiResponse)) {
    flags.push("contradiction_unresolved");
  }

  // 7. followup_needed — outcome אומר שצריך followup
  if (trace.requiresFollowup) {
    flags.push("followup_needed");
  }

  // 8. memory_write_skipped — היה צריך לכתוב לזיכרון (TBD — אין דרך לדעת אם באמת נכתב)
  // נשאר כ-placeholder, לא מפעילים כרגע

  // 9. recovery_needed — outcome = failed
  if (trace.outcomeStatus === "failed") {
    flags.push("recovery_needed");
  }

  // 10. pending_state_unresolved — מצב pending ולא הוזכר
  const isPendingState = trace.conversationState === "awaiting_owner_approval" ||
    trace.conversationState === "awaiting_meeting_response";
  if (isPendingState && !PENDING_MENTION_PATTERNS.test(aiResponse)) {
    flags.push("pending_state_unresolved");
  }

  // 11. response_too_long — תשובה ארוכה לשאילתה פשוטה
  const simpleIntents: string[] = ["greeting", "question"];
  if (simpleIntents.includes(trace.interpretedIntent) && aiResponse.length > 500) {
    flags.push("response_too_long");
  }

  // 12. response_empty — תשובה ריקה
  const trimmed = aiResponse.trim();
  if (trimmed.length === 0 || (trimmed.length < 3 && trimmed !== "[SKIP]")) {
    flags.push("response_empty");
  }

  // --- Alert level ---
  const hasCritical = flags.includes("action_claimed_not_executed");
  const alertLevel: SelfCheckResult["alertLevel"] = hasCritical
    ? "critical"
    : flags.length >= 2
      ? "warning"
      : "ok";

  // --- Summary ---
  const summary = flags.length === 0
    ? "ok"
    : `${flags.length} flag(s): ${flags.join(", ")}`;

  return { flags, alertLevel, summary };
}
