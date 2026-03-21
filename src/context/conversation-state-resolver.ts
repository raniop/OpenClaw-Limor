/**
 * Conversation State Resolver — determines the current conversation stage.
 * Deterministic rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, ToolIntent, MemoryWriteDecision, ConversationState } from "./context-types";

interface StateInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
  toolIntent: ToolIntent;
  memoryWriteDecision: MemoryWriteDecision;
}

/**
 * Resolve the current conversation state based on all resolved context.
 * Priority-ordered rules — first match wins.
 */
export function resolveConversationState(resolved: StateInput): ConversationState {
  const { bundle, primaryFocus, actionPlan, toolIntent } = resolved;

  // 1. Correction flow — strong signal, check before new_chat
  if (bundle.turnIntent.category === "correction") {
    return {
      type: "correction_flow",
      summary: "זרימת תיקון",
      reason: "המשתמש מתקן מידע קיים",
      confidence: 0.9,
    };
  }

  // 2. Awaiting user detail — clarification needed
  if (actionPlan.needsClarification) {
    return {
      type: "awaiting_user_detail",
      summary: "ממתינים לפרט מהמשתמש",
      reason: actionPlan.reason,
      confidence: 0.95,
    };
  }

  // 3. Status discussion — check before new_chat so status queries get proper state
  if (primaryFocus.type === "status") {
    return {
      type: "status_discussion",
      summary: "שיחת סטטוס",
      reason: "המשתמש ביקש תמונת מצב",
      confidence: 0.95,
    };
  }

  // 4. New chat — very little history (and not a strong intent like correction/status)
  if (bundle.conversation.messageCount <= 1) {
    return {
      type: "new_chat",
      summary: "תחילת שיחה",
      reason: "מעט מאוד היסטוריה",
      confidence: 0.9,
    };
  }

  // 5. Owner with pending approvals
  if (bundle.signals.includes("pending_approvals_exist") && bundle.person.isOwner) {
    return {
      type: "awaiting_owner_approval",
      summary: "ממתינים לאישור בעלים",
      reason: "יש אישורים פתוחים לטיפול",
      confidence: 0.85,
    };
  }

  // 6. Followup conversation
  if (primaryFocus.type === "followup") {
    return {
      type: "awaiting_followup",
      summary: "שיחת followup",
      reason: primaryFocus.reason,
      confidence: 0.9,
    };
  }

  // 7. Meeting response
  if (primaryFocus.type === "meeting") {
    return {
      type: "awaiting_meeting_response",
      summary: "שיחת פגישה",
      reason: primaryFocus.reason,
      confidence: 0.9,
    };
  }

  // 8. Action execution — tool ready, no clarification needed
  if (toolIntent.shouldUseTool && !actionPlan.needsClarification) {
    return {
      type: "action_execution",
      summary: "מוכנים לביצוע פעולה",
      reason: toolIntent.summary,
      confidence: 0.85,
    };
  }

  // Default
  return {
    type: "active_exchange",
    summary: "שיחה פעילה",
    reason: "יש אינטראקציה רגילה",
    confidence: 0.7,
  };
}
