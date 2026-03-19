/**
 * Followup Automation — Phase 15: deterministic followup creation.
 * Connects outcome evaluation to real followup store entries.
 * No AI calls, no messages, no background jobs.
 */
import type { ResolvedContext, FollowupAutomationDecision } from "./context-types";
import { getPendingFollowups, addFollowup } from "../followups";

const DEFAULT_DECISION: FollowupAutomationDecision = {
  action: "skip_not_needed",
  summary: "לא ליצור followup",
  reason: "לא נדרש followup חדש",
  confidence: 0.7,
};

/** Action plan types that warrant automated followup creation. */
const FOLLOWUP_ACTION_TYPES = new Set([
  "ask_for_missing_detail",
  "mention_followup",
  "mention_meeting",
]);

/**
 * Resolve whether a followup should be created for this turn.
 * Pure decision — does not write to the store.
 */
export function resolveFollowupAutomationDecision(
  resolved: Omit<ResolvedContext, "followupAutomationDecision" | "domainPolicy">
): FollowupAutomationDecision {
  const { outcomeEvaluation, actionPlan, executionDecision, bundle } = resolved;

  // Gate 1: outcome must require followup with a suggested time
  if (!outcomeEvaluation.requiresFollowup || !outcomeEvaluation.followupSuggestedMinutes) {
    return DEFAULT_DECISION;
  }

  // Gate 2: action plan must be a followup-worthy type
  if (!FOLLOWUP_ACTION_TYPES.has(actionPlan.type)) {
    return DEFAULT_DECISION;
  }

  // Gate 3: skip when tool execution is allowed (tools handle their own completion)
  if (executionDecision.type === "allow_tool_execution") {
    return DEFAULT_DECISION;
  }

  // Build suggested reason based on action plan type
  const suggestedReason = buildSuggestedReason(resolved);
  const suggestedDueAt = new Date(
    Date.now() + outcomeEvaluation.followupSuggestedMinutes * 60 * 1000
  ).toISOString();

  // Duplicate protection: check existing pending followups for this chat
  const chatId = bundle.person.chatId;
  const pending = getPendingFollowups().filter((f) => f.chatId === chatId);
  const normalizedReason = normalizeReason(suggestedReason);

  for (const existing of pending) {
    const normalizedExisting = normalizeReason(existing.reason);
    if (
      normalizedExisting === normalizedReason ||
      normalizedExisting.startsWith(normalizedReason) ||
      normalizedReason.startsWith(normalizedExisting)
    ) {
      return {
        action: "skip_existing",
        summary: "כבר קיים followup דומה",
        reason: "נמנעה כפילות",
        confidence: 0.9,
      };
    }
  }

  return {
    action: "create_followup",
    summary: "ליצור followup אוטומטי",
    reason: "נדרש מעקב לפי הערכת התוצאה",
    confidence: 0.9,
    suggestedDueAt,
    suggestedReason,
  };
}

/**
 * Apply the followup automation decision: resolve + write to store if needed.
 * Returns the decision for logging/inspection.
 */
export function applyFollowupAutomation(
  resolved: ResolvedContext
): FollowupAutomationDecision {
  const decision = resolved.followupAutomationDecision;

  if (
    decision.action === "create_followup" &&
    decision.suggestedDueAt &&
    decision.suggestedReason
  ) {
    const { chatId, name } = resolved.bundle.person;
    addFollowup(
      chatId,
      name,
      decision.suggestedReason,
      new Date(decision.suggestedDueAt)
    );
  }

  return decision;
}

function buildSuggestedReason(
  resolved: Omit<ResolvedContext, "followupAutomationDecision" | "domainPolicy">
): string {
  const { actionPlan, bundle } = resolved;

  if (actionPlan.type === "ask_for_missing_detail") {
    return "לחזור למשתמש אם לא שלח את הפרט החסר";
  }

  if (actionPlan.type === "mention_followup") {
    // Use the strongest available followup reason from open loops
    const followups = bundle.openLoops.followups;
    if (followups.length > 0) {
      const overdue = followups.find((f) => f.isOverdue);
      const target = overdue || followups[0];
      return target.reason.substring(0, 80);
    }
    return "מעקב על דבר פתוח";
  }

  if (actionPlan.type === "mention_meeting") {
    const meeting = bundle.openLoops.pendingMeeting;
    if (meeting) {
      return `מעקב על פגישה: ${meeting.requesterName} — ${meeting.topic}`.substring(0, 80);
    }
    return "מעקב על בקשת תיאום";
  }

  return "מעקב אוטומטי";
}

function normalizeReason(reason: string): string {
  return reason.trim().toLowerCase();
}
