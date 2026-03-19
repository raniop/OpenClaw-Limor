/**
 * Debug Trace — Phase 13: deterministic observability layer.
 * Builds a compact structured trace of how the brain reached its decision.
 * No AI calls, no DB, pure deterministic logic.
 */
import type { ResolvedContext } from "./context-types";

export type DebugTraceStep =
  | "bundle"
  | "primary_focus"
  | "response_mode"
  | "action_plan"
  | "tool_intent"
  | "memory_write"
  | "memory_commit"
  | "conversation_state"
  | "contradictions"
  | "response_strategy"
  | "execution_decision"
  | "tool_routing"
  | "compressed_prompt"
  | "outcome";

export interface DebugTraceItem {
  step: DebugTraceStep;
  summary: string;
  reason: string;
}

export interface DebugTrace {
  items: DebugTraceItem[];
  summary: string;
}

/**
 * Build a debug trace from a fully resolved context (minus debugTrace itself).
 */
export function buildDebugTrace(
  resolved: Omit<ResolvedContext, "debugTrace" | "followupAutomationDecision" | "domainPolicy">
): DebugTrace {
  const items: DebugTraceItem[] = [];

  // bundle
  items.push({
    step: "bundle",
    summary: `${resolved.bundle.person.name}, ${resolved.bundle.turnIntent.category}, עדיפות ${resolved.bundle.urgency.priority}`,
    reason: resolved.bundle.historySummary,
  });

  // primary_focus (always)
  items.push({
    step: "primary_focus",
    summary: resolved.primaryFocus.summary,
    reason: resolved.primaryFocus.reason,
  });

  // response_mode
  items.push({
    step: "response_mode",
    summary: `${resolved.responseMode.tone}, ${resolved.responseMode.brevity}, ${resolved.responseMode.structure}`,
    reason: resolved.responseMode.shouldAcknowledgeDelay
      ? "יש עיכוב לציין"
      : "ללא עיכוב",
  });

  // action_plan (always)
  items.push({
    step: "action_plan",
    summary: resolved.actionPlan.summary,
    reason: resolved.actionPlan.reason,
  });

  // tool_intent (only when type !== "none")
  if (resolved.toolIntent.type !== "none") {
    items.push({
      step: "tool_intent",
      summary: `${resolved.toolIntent.type} — ${resolved.toolIntent.summary}`,
      reason: resolved.toolIntent.reason,
    });
  }

  // memory_write
  items.push({
    step: "memory_write",
    summary: resolved.memoryWriteDecision.summary,
    reason: resolved.memoryWriteDecision.reason,
  });

  // memory_commit (only when action !== "skip")
  if (resolved.memoryCommitDecision.action !== "skip") {
    items.push({
      step: "memory_commit",
      summary: resolved.memoryCommitDecision.summary,
      reason: resolved.memoryCommitDecision.reason,
    });
  }

  // conversation_state
  items.push({
    step: "conversation_state",
    summary: resolved.conversationState.summary,
    reason: resolved.conversationState.reason,
  });

  // contradictions (only when present)
  if (resolved.contradictions.length > 0) {
    const first = resolved.contradictions[0];
    const count = resolved.contradictions.length;
    items.push({
      step: "contradictions",
      summary: count === 1 ? first.summary : `${count} סתירות: ${first.summary}`,
      reason: first.resolution,
    });
  }

  // response_strategy (always)
  items.push({
    step: "response_strategy",
    summary: resolved.responseStrategy.summary,
    reason: resolved.responseStrategy.reason,
  });

  // execution_decision (always)
  items.push({
    step: "execution_decision",
    summary: resolved.executionDecision.summary,
    reason: resolved.executionDecision.reason,
  });

  // tool_routing (always)
  items.push({
    step: "tool_routing",
    summary: resolved.toolRoutingPolicy.summary,
    reason: resolved.toolRoutingPolicy.reason,
  });

  // compressed_prompt
  const includedCount = resolved.compressedPrompt.sections.filter((s) => s.included).length;
  items.push({
    step: "compressed_prompt",
    summary: `נבחרו ${includedCount} מקטעים לפרומפט`,
    reason: resolved.compressedPrompt.summary,
  });

  // outcome (always)
  items.push({
    step: "outcome",
    summary: resolved.outcomeEvaluation.summary,
    reason: resolved.outcomeEvaluation.reason,
  });

  // Build one-line Hebrew summary
  const summary = buildTraceSummary(resolved);

  return { items, summary };
}

function buildTraceSummary(resolved: Omit<ResolvedContext, "debugTrace" | "followupAutomationDecision" | "domainPolicy">): string {
  const focus = resolved.primaryFocus.type;
  const exec = resolved.executionDecision.type;
  const strategy = resolved.responseStrategy.type;
  const hasContradictions = resolved.contradictions.length > 0;
  const needsClarification = resolved.actionPlan.needsClarification;
  const toolType = resolved.toolIntent.type;

  // Blocked execution with clarification needed
  if (exec === "clarify_before_execution" || needsClarification) {
    return "בקשת פעולה עם פרט חסר, לכן נחסמה הפעלת כלים ונבחרה הבהרה.";
  }

  // Tool execution allowed
  if (exec === "allow_tool_execution" && toolType !== "none") {
    return `זוהתה בקשה עם כלי ${toolType}, אפשר להתקדם לביצוע.`;
  }

  // Contradictions found
  if (hasContradictions) {
    return `זוהו סתירות בהקשר, נבחרה אסטרטגיית ${strategy} לפתרון.`;
  }

  // Status query
  if (focus === "status") {
    return "שאילתת סטטוס, נבחרה תשובה ישירה.";
  }

  // Followup focus
  if (focus === "followup") {
    return "זוהה followup פתוח, התגובה מתייחסת אליו.";
  }

  // Meeting focus
  if (focus === "meeting") {
    return "זוהתה בקשת תיאום, נבחרו כלי יומן.";
  }

  // New request with tool
  if (focus === "new_request" && toolType !== "none") {
    return `בקשה חדשה עם צורך בכלי ${toolType}, נבנתה תכנית פעולה.`;
  }

  // Simple reply
  if (exec === "reply_only" || strategy === "direct_reply" || strategy === "brief_answer") {
    return "הודעה פשוטה, נבחרה תגובה ישירה ללא כלים.";
  }

  // Default fallback
  return `פוקוס: ${focus}, אסטרטגיה: ${strategy}, ביצוע: ${exec}.`;
}
