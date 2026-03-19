/**
 * Outcome Tracker — post-response evaluation layer.
 * Evaluates whether the current turn completed, is pending, or needs follow-up.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, OutcomeEvaluation } from "./context-types";

type OutcomeInput = Omit<ResolvedContext, "outcomeEvaluation" | "debugTrace" | "followupAutomationDecision" | "domainPolicy">;

/**
 * Evaluate the expected outcome of the current turn.
 * Priority-ordered rules — first match wins.
 */
export function evaluateOutcome(resolved: OutcomeInput): OutcomeEvaluation {
  const { executionDecision, responseStrategy, actionPlan, toolIntent, contradictions } = resolved;

  // 1. Tool execution allowed — pending until confirmed
  if (executionDecision.type === "allow_tool_execution") {
    return {
      status: "pending",
      summary: "פעולה מתבצעת או בוצעה חלקית",
      reason: "בוצע ניסיון להפעיל כלי",
      confidence: 0.85,
      requiresFollowup: true,
      followupSuggestedMinutes: 10,
    };
  }

  // 2. Clarification needed — waiting for user
  if (responseStrategy.type === "clarify_first") {
    return {
      status: "awaiting_user",
      summary: "ממתינים למענה מהמשתמש",
      reason: "נדרש מידע נוסף",
      confidence: 0.9,
      requiresFollowup: true,
      followupSuggestedMinutes: 30,
    };
  }

  // 3. Open followup being addressed
  if (actionPlan.type === "mention_followup") {
    return {
      status: "pending",
      summary: "יש משימה פתוחה שטרם נסגרה",
      reason: "followup עדיין קיים",
      confidence: 0.8,
      requiresFollowup: true,
      followupSuggestedMinutes: 60,
    };
  }

  // 4. Status query answered
  if (actionPlan.type === "give_status") {
    return {
      status: "completed",
      summary: "ניתן סטטוס",
      reason: "בקשת סטטוס נענתה",
      confidence: 0.9,
      requiresFollowup: false,
    };
  }

  // 5. Tool blocked — needs more info
  if (executionDecision.type === "block_tool_execution") {
    return {
      status: "awaiting_user",
      summary: "נדרש מידע לפני ביצוע",
      reason: "ביצוע נחסם עקב חוסר מידע",
      confidence: 0.85,
      requiresFollowup: true,
      followupSuggestedMinutes: 30,
    };
  }

  // 6. Critical contradictions — can't proceed
  if (contradictions.some((c) => c.type === "reference_conflict" || c.type === "intent_vs_missing_info")) {
    return {
      status: "awaiting_user",
      summary: "לא ניתן להתקדם ללא הבהרה",
      reason: "סתירה או חוסר מידע",
      confidence: 0.88,
      requiresFollowup: true,
      followupSuggestedMinutes: 30,
    };
  }

  // 7. Simple reply — completed
  if (!toolIntent.shouldUseTool && responseStrategy.type === "direct_reply") {
    return {
      status: "completed",
      summary: "ניתנה תשובה",
      reason: "לא נדרש ביצוע נוסף",
      confidence: 0.85,
      requiresFollowup: false,
    };
  }

  // Default
  return {
    status: "unknown",
    summary: "אין מידע על תוצאה עדיין",
    reason: "אין אינדיקציה לפעולה שבוצעה",
    confidence: 0.6,
    requiresFollowup: false,
  };
}
