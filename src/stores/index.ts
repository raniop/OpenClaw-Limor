/**
 * Store provider.
 * Returns singleton instances of each store.
 * SQLite backend with automatic migration from JSON files.
 */
export type {
  IApprovalStore,
  IMeetingRequestStore,
  IMeetingStore,
  IConversationStore,
  PendingEntry,
  PendingEntryWithCode,
  MeetingRequest,
  MeetingRequestWithId,
  ConversationMessage,
} from "./types";

import { existsSync, readFileSync, renameSync } from "fs";
import { SqliteApprovalStore } from "./sqlite-approval-store";
import { FileMeetingRequestStore } from "./file-meeting-store";
import { SqliteConversationStore } from "./sqlite-conversation-store";
import { getDb } from "./sqlite-init";
import { statePath } from "../state-dir";

// Singleton instances
export const approvalStore = new SqliteApprovalStore();
export const meetingStore = new FileMeetingRequestStore();
export const conversationStore = new SqliteConversationStore();

// ─── One-time migration from JSON to SQLite ───────────────────────

function migrateJsonToSqlite(): void {
  const db = getDb();
  let migratedConversations = 0;
  let migratedApproved = 0;
  let migratedPending = 0;

  // --- Migrate approved.json ---
  const approvedPath = statePath("approved.json");
  if (existsSync(approvedPath)) {
    try {
      const approved: string[] = JSON.parse(readFileSync(approvedPath, "utf-8"));
      const insert = db.prepare("INSERT OR IGNORE INTO approved_contacts (chat_id) VALUES (?)");
      const tx = db.transaction(() => {
        for (const chatId of approved) {
          insert.run(chatId);
          migratedApproved++;
        }
      });
      tx();
      renameSync(approvedPath, approvedPath + ".migrated");
      console.log(`[migration] Migrated ${migratedApproved} approved contacts to SQLite`);
    } catch (err) {
      console.error("[migration] Failed to migrate approved.json:", err);
    }
  }

  // --- Migrate pending.json ---
  const pendingPath = statePath("pending.json");
  if (existsSync(pendingPath)) {
    try {
      const pending: Record<string, { chatId: string; phone: string; createdAt: string }> =
        JSON.parse(readFileSync(pendingPath, "utf-8"));
      const insert = db.prepare(
        "INSERT OR IGNORE INTO pending_contacts (code, chat_id, phone, created_at) VALUES (?, ?, ?, ?)"
      );
      const tx = db.transaction(() => {
        for (const [code, entry] of Object.entries(pending)) {
          insert.run(code, entry.chatId, entry.phone, entry.createdAt);
          migratedPending++;
        }
      });
      tx();
      renameSync(pendingPath, pendingPath + ".migrated");
      console.log(`[migration] Migrated ${migratedPending} pending contacts to SQLite`);
    } catch (err) {
      console.error("[migration] Failed to migrate pending.json:", err);
    }
  }

  // --- Migrate conversations.json ---
  const conversationsPath = statePath("conversations.json");
  if (existsSync(conversationsPath)) {
    try {
      const conversations: Record<string, Array<{ role: string; content: string; imageData?: any }>> =
        JSON.parse(readFileSync(conversationsPath, "utf-8"));
      const insert = db.prepare(
        "INSERT INTO conversations (chat_id, role, content, image_data) VALUES (?, ?, ?, ?)"
      );
      const tx = db.transaction(() => {
        for (const [chatId, messages] of Object.entries(conversations)) {
          for (const msg of messages) {
            const imageData = msg.imageData ? JSON.stringify(msg.imageData) : null;
            insert.run(chatId, msg.role, msg.content, imageData);
            migratedConversations++;
          }
        }
      });
      tx();
      renameSync(conversationsPath, conversationsPath + ".migrated");
      console.log(`[migration] Migrated ${migratedConversations} conversation messages to SQLite`);
    } catch (err) {
      console.error("[migration] Failed to migrate conversations.json:", err);
    }
  }

  if (migratedConversations > 0 || migratedApproved > 0 || migratedPending > 0) {
    console.log(
      `[migration] Total: ${migratedConversations} messages, ${migratedApproved} approved, ${migratedPending} pending → SQLite`
    );
  }
}

// Run migration on module load
migrateJsonToSqlite();

// Sync approved contacts to JSON for dashboard compatibility on every startup
syncApprovedToJsonForDashboard();

function syncApprovedToJsonForDashboard(): void {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT chat_id FROM approved_contacts").all() as Array<{ chat_id: string }>;
    const { writeFileSync } = require("fs");
    writeFileSync(statePath("approved.json"), JSON.stringify(rows.map(r => r.chat_id), null, 2), "utf-8");
    console.log(`[sync] Wrote ${rows.length} approved contacts to approved.json for dashboard`);
  } catch {}
}
