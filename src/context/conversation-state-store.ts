/**
 * Persisted Conversation State Store — in-memory store for conversation state across messages.
 *
 * State is session-only (no disk persistence needed).
 * Allows "awaiting_user_detail" and similar states to persist between message turns
 * so the resolver can use prior state as a hint rather than computing from scratch each time.
 */
import type { ConversationStateType } from "./context-types";

export interface PersistedConversationState {
  chatId: string;
  state: ConversationStateType;
  updatedAt: string;
  context?: string;  // why the state was set
}

/** In-memory store keyed by chatId */
const stateStore = new Map<string, PersistedConversationState>();

/** Staleness threshold — persisted state older than this is ignored */
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get the persisted state for a chat, or null if none exists or it's stale.
 */
export function getPersistedState(chatId: string): PersistedConversationState | null {
  const entry = stateStore.get(chatId);
  if (!entry) return null;

  const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
  if (ageMs > STALE_THRESHOLD_MS) {
    stateStore.delete(chatId);
    return null;
  }

  return entry;
}

/**
 * Save a conversation state for a chat. Overwrites any previous state.
 */
export function setPersistedState(
  chatId: string,
  state: ConversationStateType,
  context?: string
): void {
  const previous = stateStore.get(chatId);
  const previousState = previous?.state;

  stateStore.set(chatId, {
    chatId,
    state,
    updatedAt: new Date().toISOString(),
    context,
  });

  // Log state transitions
  if (previousState && previousState !== state) {
    console.log(`[state] ${chatId}: ${previousState} → ${state}${context ? ` (${context})` : ""}`);
  }
}

/**
 * Clear persisted state for a chat (e.g., on /clear command or session end).
 */
export function clearState(chatId: string): void {
  stateStore.delete(chatId);
}

/**
 * Get all active states (for debugging / dashboard).
 */
export function getAllStates(): PersistedConversationState[] {
  return Array.from(stateStore.values());
}
