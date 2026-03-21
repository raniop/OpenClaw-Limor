/**
 * Contradiction Resolver — detects conflicting signals in the resolved context.
 * Advisory diagnostics — does not block the main flow.
 * Deterministic rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, ToolIntent, MemoryWriteDecision, ContradictionFlag } from "./context-types";

interface ContradictionInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
  toolIntent: ToolIntent;
  memoryWriteDecision: MemoryWriteDecision;
}

/**
 * Detect contradictions between different resolved context layers.
 * Returns empty array when everything is consistent.
 */
export function resolveContradictions(resolved: ContradictionInput): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];
  const { bundle, primaryFocus, responseMode, actionPlan, toolIntent } = resolved;

  // 1. Intent vs missing info
  if (
    (bundle.turnIntent.category === "action_request" || bundle.turnIntent.category === "reminder_request") &&
    !bundle.missingInfo.missing.includes("none")
  ) {
    flags.push({
      type: "intent_vs_missing_info",
      summary: "יש בקשת פעולה אבל חסר מידע לביצוע",
      resolution: "לבקש קודם את הפרט החסר",
      confidence: 0.95,
    });
  }

  // 2. Reply vs action
  if (
    toolIntent.shouldUseTool &&
    responseMode.structure === "direct_answer" &&
    primaryFocus.type === "new_request"
  ) {
    flags.push({
      type: "reply_vs_action",
      summary: "יש בקשה שמרמזת על ביצוע, אבל מבנה התשובה עדיין תשובה ישירה",
      resolution: "להעדיף תשובה שמקדמת ביצוע",
      confidence: 0.8,
    });
  }

  // 3. Status vs new request
  if (
    bundle.turnIntent.category === "status_query" &&
    toolIntent.shouldUseTool &&
    toolIntent.type !== "none"
  ) {
    flags.push({
      type: "status_vs_new_request",
      summary: "יש ערבוב בין בקשת סטטוס לבקשת פעולה חדשה",
      resolution: "לתת קודם סטטוס ואז לעבור לפעולה רק אם נדרש",
      confidence: 0.75,
    });
  }

  // 4. Reference conflict — multiple strong person references
  const strongPersonRefs = bundle.references.filter(
    (r) => r.kind === "person" && r.confidence >= 0.75
  );
  if (strongPersonRefs.length > 1) {
    flags.push({
      type: "reference_conflict",
      summary: "יש יותר מייחוס אחד אפשרי לאדם",
      resolution: "לבקש הבהרה למי הכוונה",
      confidence: 0.85,
    });
  }

  // 5. Correction override — user is correcting/cancelling a previous instruction
  if (bundle.turnIntent.category === "correction") {
    flags.push({
      type: "correction_override",
      summary: "המשתמש מתקן או מבטל הוראה קודמת",
      resolution: "לבטל את הפעולה הקודמת ולפעול לפי ההוראה החדשה",
      confidence: 0.9,
    });
  }

  // 6. Urgency conflict — low priority but overdue followup exists
  if (
    bundle.urgency.priority === "low" &&
    bundle.openLoops.followups.some((f) => f.isOverdue)
  ) {
    flags.push({
      type: "urgency_conflict",
      summary: "נמצאה סתירה בין עדיפות נמוכה לבין followup שעבר זמנו",
      resolution: "להתייחס כעדיפות גבוהה",
      confidence: 0.95,
    });
  }

  return flags;
}
