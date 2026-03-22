/**
 * SQLite implementation of IApprovalStore.
 * Syncs approved contacts to approved.json for dashboard compatibility.
 */
import { writeFileSync } from "fs";
import type { IApprovalStore, PendingEntry, PendingEntryWithCode } from "./types";
import { getDb } from "./sqlite-init";
import { statePath } from "../state-dir";

/** Write approved list to JSON so the dashboard can read it */
function syncApprovedToJson(): void {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT chat_id FROM approved_contacts").all() as Array<{ chat_id: string }>;
    writeFileSync(statePath("approved.json"), JSON.stringify(rows.map(r => r.chat_id), null, 2), "utf-8");
  } catch {}
}

export class SqliteApprovalStore implements IApprovalStore {
  isApproved(chatId: string): boolean {
    const db = getDb();
    const row = db.prepare("SELECT 1 FROM approved_contacts WHERE chat_id = ?").get(chatId);
    return !!row;
  }

  addApproved(chatId: string): void {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO approved_contacts (chat_id) VALUES (?)").run(chatId);
    syncApprovedToJson();
  }

  removeApproved(chatId: string): boolean {
    const db = getDb();
    const result = db.prepare("DELETE FROM approved_contacts WHERE chat_id = ?").run(chatId);
    if (result.changes > 0) syncApprovedToJson();
    return result.changes > 0;
  }

  isPending(chatId: string): boolean {
    const db = getDb();
    const row = db.prepare("SELECT 1 FROM pending_contacts WHERE chat_id = ?").get(chatId);
    return !!row;
  }

  addPending(chatId: string, phone: string): string {
    const db = getDb();
    // Check for existing pending entry for this chatId
    const existing = db.prepare("SELECT code FROM pending_contacts WHERE chat_id = ?").get(chatId) as { code: string } | undefined;
    if (existing) return existing.code;

    const code = generateCode();
    db.prepare("INSERT INTO pending_contacts (code, chat_id, phone) VALUES (?, ?, ?)").run(code, chatId, phone);
    return code;
  }

  approveByCode(code: string): PendingEntry | null {
    const db = getDb();
    const upper = code.toUpperCase();
    const row = db.prepare("SELECT chat_id, phone, created_at FROM pending_contacts WHERE code = ?").get(upper) as
      { chat_id: string; phone: string; created_at: string } | undefined;
    if (!row) return null;

    this.addApproved(row.chat_id); // already syncs JSON
    db.prepare("DELETE FROM pending_contacts WHERE code = ?").run(upper);
    return { chatId: row.chat_id, phone: row.phone, createdAt: row.created_at };
  }

  rejectByCode(code: string): PendingEntry | null {
    const db = getDb();
    const upper = code.toUpperCase();
    const row = db.prepare("SELECT chat_id, phone, created_at FROM pending_contacts WHERE code = ?").get(upper) as
      { chat_id: string; phone: string; created_at: string } | undefined;
    if (!row) return null;

    db.prepare("DELETE FROM pending_contacts WHERE code = ?").run(upper);
    return { chatId: row.chat_id, phone: row.phone, createdAt: row.created_at };
  }

  getLastPending(): PendingEntryWithCode | null {
    const db = getDb();
    const row = db.prepare(
      "SELECT code, chat_id, phone, created_at FROM pending_contacts ORDER BY rowid DESC LIMIT 1"
    ).get() as { code: string; chat_id: string; phone: string; created_at: string } | undefined;
    if (!row) return null;
    return { code: row.code, chatId: row.chat_id, phone: row.phone, createdAt: row.created_at };
  }

  getPendingCount(): number {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM pending_contacts").get() as any;
    return row.cnt;
  }
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
