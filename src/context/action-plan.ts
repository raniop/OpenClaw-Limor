/**
 * Action Planner — determines what action Limor should take this turn.
 * Uses missingInfo and references for precise clarification.
 * Deterministic priority-ordered rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan } from "./context-types";

interface ActionPlanInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
}

/**
 * Resolve the action plan based on the context bundle, focus, and response mode.
 * Uses strict priority ordering — first match wins.
 */
export function resolveActionPlan(resolved: ActionPlanInput): ActionPlan {
  const { bundle, primaryFocus } = resolved;

  // 1. Status request
  if (primaryFocus.type === "status") {
    return {
      type: "give_status",
      summary: "לתת סטטוס מרוכז",
      reason: "המשתמש ביקש סטטוס",
      confidence: 0.95,
      needsClarification: false,
    };
  }

  // 2. Correction
  if (bundle.turnIntent.category === "correction") {
    return {
      type: "confirm_correction",
      summary: "לאשר את התיקון ולטפל בו",
      reason: "המשתמש מתקן מידע קיים",
      confidence: 0.95,
      needsClarification: false,
    };
  }

  // 3. Followup — enrich reason with resolved references
  if (primaryFocus.type === "followup") {
    const firstFollowup = bundle.openLoops.followups[0];
    const reason = firstFollowup
      ? `followup פתוח: "${firstFollowup.reason.substring(0, 60)}"`
      : "יש followup פתוח";
    return {
      type: "mention_followup",
      summary: "להתייחס ל-followup הפתוח",
      reason,
      confidence: 0.9,
      needsClarification: false,
    };
  }

  // 4. Meeting — enrich with reference data
  if (primaryFocus.type === "meeting") {
    const meeting = bundle.openLoops.pendingMeeting;
    const reason = meeting
      ? `פגישה ממתינה: ${meeting.requesterName} — ${meeting.topic}`
      : "יש פגישה ממתינה";
    return {
      type: "mention_meeting",
      summary: "להתייחס לפגישה הממתינה",
      reason,
      confidence: 0.9,
      needsClarification: false,
    };
  }

  // 5. Multi-step request — complex tasks that need planning
  if (bundle.turnIntent.category === "multi_step_request") {
    return {
      type: "handle_multi_step",
      summary: "לתכנן ולבצע משימה מורכבת בכמה שלבים",
      reason: "המשתמש ביקש משהו שדורש כמה פעולות",
      confidence: 0.85,
      needsClarification: false,
    };
  }

  // 6. New request — use missingInfo for precise clarification
  if (primaryFocus.type === "new_request") {
    const hasMissing = !bundle.missingInfo.missing.includes("none");
    if (hasMissing) {
      return {
        type: "ask_for_missing_detail",
        summary: "לבקש פרט חסר לפני פעולה",
        reason: bundle.missingInfo.summary,
        confidence: Math.max(0.85, bundle.missingInfo.confidence),
        needsClarification: true,
      };
    }
    return {
      type: "handle_new_request",
      summary: "לטפל בבקשה החדשה",
      reason: "המשתמש ביקש פעולה חדשה",
      confidence: 0.85,
      needsClarification: false,
    };
  }

  // Default
  return {
    type: "reply_only",
    summary: "לתת מענה ישיר",
    reason: "אין טריגר לפעולה מיוחדת",
    confidence: 0.6,
    needsClarification: false,
  };
}
