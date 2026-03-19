/**
 * Response Strategy Resolver — determines the preferred answer strategy for this turn.
 * Final decision layer sitting on top of all other resolved context.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, ResponseStrategy } from "./context-types";

interface StrategyInput {
  bundle: ResolvedContext["bundle"];
  primaryFocus: ResolvedContext["primaryFocus"];
  responseMode: ResolvedContext["responseMode"];
  actionPlan: ResolvedContext["actionPlan"];
  toolIntent: ResolvedContext["toolIntent"];
  memoryWriteDecision: ResolvedContext["memoryWriteDecision"];
  conversationState: ResolvedContext["conversationState"];
  contradictions: ResolvedContext["contradictions"];
}

/**
 * Resolve the final response strategy based on all resolved context layers.
 * Priority-ordered rules — first match wins.
 */
export function resolveResponseStrategy(resolved: StrategyInput): ResponseStrategy {
  const { bundle, primaryFocus, responseMode, actionPlan, toolIntent, conversationState, contradictions } = resolved;

  // 1. Clarification needed — always ask first
  if (actionPlan.needsClarification) {
    return {
      type: "clarify_first",
      summary: "לבקש הבהרה לפני כל פעולה",
      reason: actionPlan.reason,
      confidence: 0.95,
    };
  }

  // 2. Status + new request contradiction — status first
  if (contradictions.some((c) => c.type === "status_vs_new_request")) {
    return {
      type: "status_then_action",
      summary: "לתת קודם סטטוס ואז לשקול פעולה",
      reason: "יש ערבוב בין בקשת סטטוס לבקשת פעולה",
      confidence: 0.9,
    };
  }

  // 3. Tool ready and clear — acknowledge and execute
  if (toolIntent.shouldUseTool && !actionPlan.needsClarification) {
    return {
      type: "acknowledge_and_execute",
      summary: "לאשר בקצרה ולהתקדם לביצוע",
      reason: toolIntent.summary,
      confidence: 0.9,
    };
  }

  // 4. Followup focus — acknowledge and address
  if (primaryFocus.type === "followup") {
    return {
      type: "acknowledge_and_followup",
      summary: "להכיר בנושא הפתוח ולהתייחס אליו",
      reason: primaryFocus.reason,
      confidence: 0.88,
    };
  }

  // 5. Repeated unanswered messages — be brief
  if (responseMode.brevity === "short" && bundle.conversation.repeatedRecentMessages) {
    return {
      type: "brief_answer",
      summary: "לתת תשובה קצרה וישירה",
      reason: "יש כמה הודעות בלי מענה",
      confidence: 0.85,
    };
  }

  // 6. Owner status discussion — structured summary
  if (bundle.person.isOwner && conversationState.type === "status_discussion") {
    return {
      type: "owner_summary",
      summary: "לתת סיכום מסודר לבעלים",
      reason: "רני ביקש סטטוס",
      confidence: 0.9,
    };
  }

  // Default
  return {
    type: "direct_reply",
    summary: "לתת מענה ישיר",
    reason: "אין צורך באסטרטגיה מיוחדת",
    confidence: 0.7,
  };
}
