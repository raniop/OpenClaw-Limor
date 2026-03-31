/**
 * Persisted Conversation State Store — SQLite-backed store for conversation state across messages.
 *
 * Survives PM2 restarts and bot crashes.
 * Allows "awaiting_user_detail" and similar states to persist between message turns
 * so the resolver can use prior state as a hint rather than computing from scratch each time.
 */
import type { ConversationStateType } from "./context-types";
import { getDb } from "../stores/sqlite-init";

export interface PersistedConversationState {
  chatId: string;
  state: ConversationStateType;
  updatedAt: string;
  context?: string;  // why the state was set
}

/** Staleness threshold — persisted state older than this is ignored */
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get the persisted state for a chat, or null if none exists or it's stale.
 */
export function getPersistedState(chatId: string): PersistedConversationState | null {
  const db = getDb();
  const row = db.prepare("SELECT chat_id, state, context, updated_at FROM conversation_states WHERE chat_id = ?").get(chatId) as any;
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (ageMs > STALE_THRESHOLD_MS) {
    db.prepare("DELETE FROM conversation_states WHERE chat_id = ?").run(chatId);
    return null;
  }

  return {
    chatId: row.chat_id,
    state: row.state as ConversationStateType,
    updatedAt: row.updated_at,
    context: row.context || undefined,
  };
}

/**
 * Save a conversation state for a chat. Overwrites any previous state.
 */
export function setPersistedState(
  chatId: string,
  state: ConversationStateType,
  context?: string
): void {
  const db = getDb();

  // Check previous state for logging
  const previous = db.prepare("SELECT state FROM conversation_states WHERE chat_id = ?").get(chatId) as any;
  const previousState = previous?.state;

  db.prepare(
    "INSERT OR REPLACE INTO conversation_states (chat_id, state, context, updated_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(chatId, state, context || null);

  // Log state transitions
  if (previousState && previousState !== state) {
    console.log(`[state] ${chatId}: ${previousState} → ${state}${context ? ` (${context})` : ""}`);
  }
}

/**
 * Clear persisted state for a chat (e.g., on /clear command or session end).
 */
export function clearState(chatId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM conversation_states WHERE chat_id = ?").run(chatId);
}

/**
 * Get all active states (for debugging / dashboard).
 */
export function getAllStates(): PersistedConversationState[] {
  const db = getDb();
  const rows = db.prepare("SELECT chat_id, state, context, updated_at FROM conversation_states").all() as any[];
  const now = Date.now();
  return rows
    .filter((row) => now - new Date(row.updated_at).getTime() <= STALE_THRESHOLD_MS)
    .map((row) => ({
      chatId: row.chat_id,
      state: row.state as ConversationStateType,
      updatedAt: row.updated_at,
      context: row.context || undefined,
    }));
}

// ─── Context Snapshot (survives restart) ─────────────────────────

/** Snapshot staleness — ignore snapshots older than 2 hours */
const SNAPSHOT_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Save a compressed context snapshot for a chat.
 * Called after every message processing to ensure the latest context is persisted.
 */
export function saveContextSnapshot(chatId: string, snapshot: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO context_snapshots (chat_id, snapshot, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(chatId, snapshot);
}

/**
 * Get the last context snapshot for a chat, or null if none or stale.
 * Used on first message after restart to restore conversation context.
 */
export function getContextSnapshot(chatId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT snapshot, updated_at FROM context_snapshots WHERE chat_id = ?").get(chatId) as any;
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (ageMs > SNAPSHOT_STALE_MS) return null;

  return row.snapshot;
}
