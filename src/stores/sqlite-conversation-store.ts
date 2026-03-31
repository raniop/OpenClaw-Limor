/**
 * SQLite implementation of IConversationStore.
 */
import type { IConversationStore, ConversationMessage } from "./types";
import { getDb } from "./sqlite-init";
import { config } from "../config";

export class SqliteConversationStore implements IConversationStore {
  addMessage(chatId: string, role: "user" | "assistant", content: string): void {
    const db = getDb();
    db.prepare("INSERT INTO conversations (chat_id, role, content) VALUES (?, ?, ?)").run(chatId, role, content);

    // Trim to max history — keep only the most recent messages
    const maxMessages = config.maxHistory * 2;
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM conversations WHERE chat_id = ?").get(chatId) as any).cnt;
    if (count > maxMessages) {
      const overflow = count - maxMessages;
      db.prepare(`
        DELETE FROM conversations WHERE id IN (
          SELECT id FROM conversations WHERE chat_id = ? ORDER BY id ASC LIMIT ?
        )
      `).run(chatId, overflow);
    }
  }

  getHistory(chatId: string): ConversationMessage[] {
    const db = getDb();
    const rows = db.prepare(
      "SELECT role, content, image_data FROM conversations WHERE chat_id = ? ORDER BY id ASC"
    ).all(chatId) as Array<{ role: string; content: string; image_data: string | null }>;

    return rows.map((row) => {
      const msg: ConversationMessage = {
        role: row.role as "user" | "assistant",
        content: row.content,
      };
      if (row.image_data) {
        try {
          msg.imageData = JSON.parse(row.image_data);
        } catch {}
      }
      return msg;
    });
  }

  clearHistory(chatId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM conversations WHERE chat_id = ?").run(chatId);
  }

  getSummary(chatId: string): string {
    const db = getDb();
    const row = db.prepare(
      "SELECT summary FROM conversation_summaries WHERE chat_id = ?"
    ).get(chatId) as { summary: string } | undefined;
    return row?.summary || "";
  }

  saveSummary(chatId: string, summary: string): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO conversation_summaries (chat_id, summary, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(chat_id) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at
    `).run(chatId, summary);
  }

  /** Get all chat IDs with conversations (for rotation/migration) */
  getAllChatIds(): string[] {
    const db = getDb();
    const rows = db.prepare("SELECT DISTINCT chat_id FROM conversations").all() as Array<{ chat_id: string }>;
    return rows.map((r) => r.chat_id);
  }

  /** Get message count for a chat */
  getMessageCount(chatId: string): number {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM conversations WHERE chat_id = ?").get(chatId) as any;
    return row.cnt;
  }

  /** Get recent conversations from the last N days */
  getRecentHistory(chatId: string, days: number): Array<{ role: string; content: string; created_at: string }> {
    const db = getDb();
    return db.prepare(
      "SELECT role, content, created_at FROM conversations WHERE chat_id = ? AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY id ASC"
    ).all(chatId, days) as Array<{ role: string; content: string; created_at: string }>;
  }
}
