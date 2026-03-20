/**
 * Execution Guardrails — advisory decision layer.
 * NEVER blocks tools. Tools are ALWAYS available.
 * Instead, provides guidance on whether to ask the owner first,
 * request clarification, or proceed directly.
 *
 * Philosophy: Let Claude decide, but give it clear guidance.
 * If unsure — ask Rani via notify_owner / request_meeting.
 * Never silently block and cause Claude to hallucinate actions.
 */
import type { ResolvedContext, ExecutionDecision } from "./context-types";

type GuardrailInput = Omit<ResolvedContext, "executionDecision" | "toolRoutingPolicy" | "compressedPrompt" | "outcomeEvaluation" | "debugTrace" | "followupAutomationDecision" | "domainPolicy">;

/**
 * Resolve the execution decision based on all resolved context layers.
 * Tools are ALWAYS allowed — guidance only.
 */
export function resolveExecutionDecision(resolved: GuardrailInput): ExecutionDecision {
  const { responseStrategy, contradictions, toolIntent, actionPlan, bundle } = resolved;

  // 1. Clarify-first strategy — suggest clarification but keep tools open
  if (responseStrategy.type === "clarify_first") {
    return {
      type: "clarify_before_execution",
      summary: "מומלץ לבקש הבהרה, אבל כלים זמינים",
      reason: responseStrategy.reason,
      confidence: 0.9,
      allowTools: true,
    };
  }

  // 2. Reference conflict — suggest clarification
  if (contradictions.some((c) => c.type === "reference_conflict")) {
    return {
      type: "clarify_before_execution",
      summary: "יש ambiguity — מומלץ לשאול, כלים זמינים",
      reason: "יש יותר מייחוס אחד אפשרי",
      confidence: 0.9,
      allowTools: true,
    };
  }

  // 3. Intent vs missing info — suggest asking for missing detail
  if (contradictions.some((c) => c.type === "intent_vs_missing_info")) {
    return {
      type: "clarify_before_execution",
      summary: "חסר מידע — מומלץ לשאול, כלים זמינים",
      reason: "יש בקשת פעולה אך חסר פרט הכרחי",
      confidence: 0.9,
      allowTools: true,
    };
  }

  // 4. Tool ready + clear strategy — full green light
  if (
    toolIntent.shouldUseTool &&
    !actionPlan.needsClarification &&
    responseStrategy.type === "acknowledge_and_execute"
  ) {
    return {
      type: "allow_tool_execution",
      summary: "אפשר להתקדם לביצוע",
      reason: toolIntent.summary,
      confidence: 0.95,
      allowTools: true,
    };
  }

  // 5. Tool intent exists but strategy not fully aligned — allow but suggest caution
  if (toolIntent.shouldUseTool) {
    return {
      type: "allow_tool_execution",
      summary: "כלים זמינים, מומלץ לוודא פרטים לפני ביצוע",
      reason: "יש כוונת כלי — אם חסר פרט, לשאול את המשתמש או את רני",
      confidence: 0.85,
      allowTools: true,
    };
  }

  // Default: tools always available
  return {
    type: "reply_only",
    summary: "תגובה רגילה, כלים זמינים אם צריך",
    reason: "לא זוהה צורך ודאי בכלי, אבל אם יש צורך — אפשר",
    confidence: 0.7,
    allowTools: true,
  };
}
