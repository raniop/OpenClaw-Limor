/**
 * SQLite database initialization.
 * Single database at workspace/state/limor.db with WAL mode enabled.
 */
import Database from "better-sqlite3";
import { statePath } from "../state-dir";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = statePath("limor.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      image_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);

    CREATE TABLE IF NOT EXISTS approved_contacts (
      chat_id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_contacts (
      code TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS muted_groups (
      chat_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      muted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_summaries (
      chat_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log(`[sqlite] Database initialized at ${dbPath}`);
  return db;
}
