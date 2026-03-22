/**
 * Conversation State Resolver — determines the current conversation stage.
 * Deterministic rules, no AI calls.
 *
 * Now integrates with the persisted state store: before resolving from scratch,
 * checks if there's a recent persisted state that can serve as a hint.
 * After resolving, persists the new state for future turns.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, ToolIntent, MemoryWriteDecision, ConversationState, ConversationStateType } from "./context-types";
import { getPersistedState, setPersistedState } from "./conversation-state-store";

interface StateInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
  toolIntent: ToolIntent;
  memoryWriteDecision: MemoryWriteDecision;
}

/** States that benefit from persistence — the user is "in the middle of something" */
const STICKY_STATES: Set<ConversationStateType> = new Set([
  "awaiting_user_detail",
  "awaiting_owner_approval",
  "awaiting_followup",
  "awaiting_meeting_response",
]);

/** Persist state and return it (helper to avoid repetition) */
function persist(chatId: string, state: ConversationState): ConversationState {
  if (chatId) {
    setPersistedState(chatId, state.type, state.reason);
  }
  return state;
}

/**
 * Resolve the current conversation state based on all resolved context.
 * Priority-ordered rules — first match wins.
 *
 * Uses persisted state as a hint: if the previous state was a "sticky" state
 * (like awaiting_user_detail) and no strong new signal overrides it,
 * the persisted state is carried forward.
 */
export function resolveConversationState(resolved: StateInput): ConversationState {
  const { bundle, primaryFocus, actionPlan, toolIntent } = resolved;
  const chatId = bundle.person.chatId;

  // 1. Correction flow — strong signal, check before new_chat
  if (bundle.turnIntent.category === "correction") {
    return persist(chatId, {
      type: "correction_flow",
      summary: "זרימת תיקון",
      reason: "המשתמש מתקן מידע קיים",
      confidence: 0.9,
    });
  }

  // 2. Awaiting user detail — clarification needed
  if (actionPlan.needsClarification) {
    return persist(chatId, {
      type: "awaiting_user_detail",
      summary: "ממתינים לפרט מהמשתמש",
      reason: actionPlan.reason,
      confidence: 0.95,
    });
  }

  // 3. Status discussion — check before new_chat so status queries get proper state
  if (primaryFocus.type === "status") {
    return persist(chatId, {
      type: "status_discussion",
      summary: "שיחת סטטוס",
      reason: "המשתמש ביקש תמונת מצב",
      confidence: 0.95,
    });
  }

  // 3.5. Persisted state hint — if the previous state was "sticky" (like awaiting_user_detail)
  // and no strong override matched above, carry it forward as a hint.
  const persisted = chatId ? getPersistedState(chatId) : null;
  if (persisted && STICKY_STATES.has(persisted.state)) {
    // Strong signals (correction, clarification needed, status) already matched above.
    // If we're here, the current turn is ambiguous — prefer persisted sticky state.
    const hintResult: ConversationState = {
      type: persisted.state,
      summary: `המשך מצב קודם: ${persisted.state}`,
      reason: persisted.context || "persisted from previous turn",
      confidence: 0.8,
    };
    setPersistedState(chatId, hintResult.type, hintResult.reason);
    return hintResult;
  }

  // 4. New chat — very little history (and not a strong intent like correction/status)
  if (bundle.conversation.messageCount <= 1) {
    return persist(chatId, {
      type: "new_chat",
      summary: "תחילת שיחה",
      reason: "מעט מאוד היסטוריה",
      confidence: 0.9,
    });
  }

  // 5. Owner with pending approvals
  if (bundle.signals.includes("pending_approvals_exist") && bundle.person.isOwner) {
    return persist(chatId, {
      type: "awaiting_owner_approval",
      summary: "ממתינים לאישור בעלים",
      reason: "יש אישורים פתוחים לטיפול",
      confidence: 0.85,
    });
  }

  // 6. Followup conversation
  if (primaryFocus.type === "followup") {
    return persist(chatId, {
      type: "awaiting_followup",
      summary: "שיחת followup",
      reason: primaryFocus.reason,
      confidence: 0.9,
    });
  }

  // 7. Meeting response
  if (primaryFocus.type === "meeting") {
    return persist(chatId, {
      type: "awaiting_meeting_response",
      summary: "שיחת פגישה",
      reason: primaryFocus.reason,
      confidence: 0.9,
    });
  }

  // 8. Action execution — tool ready, no clarification needed
  if (toolIntent.shouldUseTool && !actionPlan.needsClarification) {
    return persist(chatId, {
      type: "action_execution",
      summary: "מוכנים לביצוע פעולה",
      reason: toolIntent.summary,
      confidence: 0.85,
    });
  }

  // Default
  return persist(chatId, {
    type: "active_exchange",
    summary: "שיחה פעילה",
    reason: "יש אינטראקציה רגילה",
    confidence: 0.7,
  });
}
