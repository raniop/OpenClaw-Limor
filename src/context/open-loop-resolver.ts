/**
 * Open Loop Resolver — surfaces actual pending items with full content.
 * Replaces boolean "hasFollowup" with concrete task descriptions.
 */
import { getPendingFollowups, getDueFollowups } from "../followups";
import { conversationStore } from "../stores";
import { getActiveMeeting } from "../meetings";
import type { OpenLoopContext } from "./context-types";

/**
 * Resolve all open loops for a specific chat.
 * Returns actual followup content, pending meetings, and last assistant message.
 */
export function resolveOpenLoops(chatId: string): OpenLoopContext {
  // Get followups with full content
  const allPending = getPendingFollowups();
  const chatFollowups = allPending.filter((f) => f.chatId === chatId);
  const allOverdue = getDueFollowups();
  const overdueIds = new Set(
    allOverdue.filter((f) => f.chatId === chatId).map((f) => f.id)
  );

  const followups = chatFollowups.map((f) => ({
    reason: f.reason,
    dueAt: f.dueAt,
    isOverdue: overdueIds.has(f.id),
    requesterName: f.requesterName,
  }));

  // Check for pending meeting request from this chat (uses state machine)
  let pendingMeeting: OpenLoopContext["pendingMeeting"];
  const activeMeeting = getActiveMeeting(chatId);
  if (activeMeeting) {
    pendingMeeting = {
      requesterName: activeMeeting.contactName,
      topic: activeMeeting.topic,
      id: activeMeeting.id,
    };
  }

  // Last assistant message for conversational continuity
  const history = conversationStore.getHistory(chatId);
  let lastAssistantMessage: string | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      lastAssistantMessage = history[i].content;
      break;
    }
  }

  return { followups, pendingMeeting, lastAssistantMessage };
}
