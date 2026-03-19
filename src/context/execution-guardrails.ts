/**
 * Execution Guardrails — final operational decision layer.
 * Determines whether the system can safely proceed to tool execution
 * or must constrain behavior first.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, ExecutionDecision } from "./context-types";

type GuardrailInput = Omit<ResolvedContext, "executionDecision" | "toolRoutingPolicy" | "compressedPrompt" | "outcomeEvaluation">;

/**
 * Resolve the execution decision based on all resolved context layers.
 * Priority-ordered rules — first match wins.
 */
export function resolveExecutionDecision(resolved: GuardrailInput): ExecutionDecision {
  const { responseStrategy, contradictions, toolIntent, actionPlan } = resolved;

  // 1. Clarify-first strategy — block everything
  if (responseStrategy.type === "clarify_first") {
    return {
      type: "clarify_before_execution",
      summary: "לבקש הבהרה לפני כל ביצוע",
      reason: responseStrategy.reason,
      confidence: 0.98,
      allowTools: false,
    };
  }

  // 2. Reference conflict — ambiguity blocks execution
  if (contradictions.some((c) => c.type === "reference_conflict")) {
    return {
      type: "clarify_before_execution",
      summary: "יש ambiguity בייחוס — חייבים הבהרה",
      reason: "יש יותר מייחוס אחד אפשרי",
      confidence: 0.97,
      allowTools: false,
    };
  }

  // 3. Intent vs missing info conflict — critical info missing
  if (contradictions.some((c) => c.type === "intent_vs_missing_info")) {
    return {
      type: "clarify_before_execution",
      summary: "חסר מידע קריטי לביצוע",
      reason: "יש בקשת פעולה אך חסר פרט הכרחי",
      confidence: 0.97,
      allowTools: false,
    };
  }

  // 4. Tool ready + clear strategy — allow execution
  if (
    toolIntent.shouldUseTool &&
    !actionPlan.needsClarification &&
    responseStrategy.type === "acknowledge_and_execute"
  ) {
    return {
      type: "allow_tool_execution",
      summary: "אפשר להתקדם לביצוע",
      reason: toolIntent.summary,
      confidence: 0.92,
      allowTools: true,
    };
  }

  // 5. Tool intent but strategy doesn't support execution yet
  if (toolIntent.shouldUseTool && responseStrategy.type !== "acknowledge_and_execute") {
    return {
      type: "block_tool_execution",
      summary: "יש פוטנציאל לכלי אבל לא נכון לבצע עדיין",
      reason: "אסטרטגיית התגובה הנוכחית לא תומכת בביצוע מיידי",
      confidence: 0.88,
      allowTools: false,
    };
  }

  // 6. Status vs new request contradiction — safe fallback
  if (contradictions.some((c) => c.type === "status_vs_new_request")) {
    return {
      type: "safe_fallback_reply",
      summary: "לתת קודם מענה בטוח ולא לבצע",
      reason: "יש ערבוב בין סטטוס לפעולה חדשה",
      confidence: 0.9,
      allowTools: false,
    };
  }

  // Default: reply only
  return {
    type: "reply_only",
    summary: "להשיב בטקסט בלבד",
    reason: "לא זוהה צורך ודאי בביצוע",
    confidence: 0.7,
    allowTools: false,
  };
}
