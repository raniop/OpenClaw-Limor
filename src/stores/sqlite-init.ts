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

    CREATE TABLE IF NOT EXISTS contacts (
      chat_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      aliases TEXT,
      relationship_type TEXT,
      importance_score INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT (datetime('now')),
      source TEXT DEFAULT 'auto'
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

    CREATE TABLE IF NOT EXISTS health_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      steps INTEGER,
      calories_burned INTEGER,
      active_calories INTEGER,
      exercise_minutes INTEGER,
      distance_km REAL,
      stand_hours INTEGER,
      resting_heart_rate INTEGER,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, source)
    );

    CREATE INDEX IF NOT EXISTS idx_health_data_date ON health_data(date);

    CREATE TABLE IF NOT EXISTS conversation_states (
      chat_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      context TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS topic_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      key_details TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      message_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_topic_segments_chat ON topic_segments(chat_id);
    CREATE INDEX IF NOT EXISTS idx_topic_segments_topic ON topic_segments(topic);

    CREATE TABLE IF NOT EXISTS context_snapshots (
      chat_id TEXT PRIMARY KEY,
      snapshot TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      steps TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plans_chat_id ON plans(chat_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      result_summary TEXT,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at);

    CREATE TABLE IF NOT EXISTS agent_state (
      agent_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, key)
    );
  `);

  console.log(`[sqlite] Database initialized at ${dbPath}`);
  return db;
}
