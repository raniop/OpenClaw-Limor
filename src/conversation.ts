import { writeFileSync, readFileSync, existsSync } from "fs";
import { config } from "./config";
import { statePath } from "./state-dir";
import { client as aiClient } from "./ai/client";
import { getDb } from "./stores/sqlite-init";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

// ─── AI-powered rolling summary ─────────────────────────────────────

/**
 * Generate an AI summary of dropped messages using Sonnet (cheap + fast).
 * Runs in background — doesn't block the response.
 * The summary is APPENDED to existing summary, creating a rolling chain.
 */
async function aiSummarizeDropped(chatId: string, messages: Message[]): Promise<void> {
  if (messages.length < 3) return; // Not worth summarizing < 3 messages

  try {
    const conversation = messages
      .map((m) => `${m.role === "user" ? "משתמש" : "לימור"}: ${m.content.substring(0, 200)}`)
      .join("\n");

    // Load existing rolling summary
    const existingSummary = getSummary(chatId);

    const prompt = `אתה מסכם שיחות. תפקידך ליצור סיכום קצר ותמציתי של מה שהיה בשיחה.

${existingSummary ? `סיכום קודם של השיחה:\n${existingSummary}\n\n` : ""}הודעות חדשות שצריך להוסיף לסיכום:
${conversation}

כתוב סיכום מעודכן ומאוחד (לא יותר מ-10 שורות) שכולל:
- מה דובר ומה הוחלט
- בקשות/משימות שעלו והאם טופלו
- שמות אנשים ומה הם ביקשו
- נושאים מרכזיים
- דברים שעדיין פתוחים

כתוב בעברית, בצורה תמציתית. החזר רק את הסיכום, בלי הקדמות.`;

    const response = await aiClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content.find((b) => b.type === "text") as any)?.text || "";
    if (text.length > 10) {
      saveSummary(chatId, text);
      console.log(`[conversation] AI summary updated for ${chatId.replace(/[^a-zA-Z0-9_-]/g, "_")} (${messages.length} messages → ${text.length} chars)`);
    }
  } catch (err) {
    // Fallback to deterministic summary
    const fallback = deterministicSummary(messages);
    if (fallback) saveSummary(chatId, fallback);
    console.error("[conversation] AI summary failed, using fallback:", err);
  }
}

/**
 * Deterministic fallback summary (no AI).
 */
function deterministicSummary(messages: Message[]): string {
  if (messages.length === 0) return "";
  const topics = new Set<string>();
  const names = new Set<string>();
  const actions = new Set<string>();

  for (const msg of messages) {
    const nameMatch = msg.content.match(/^\[([^\]]+)\]:/);
    if (nameMatch) names.add(nameMatch[1]);

    if (/פגישה|יומן|meeting|calendar/.test(msg.content)) topics.add("פגישות");
    if (/מסעדה|הזמנה|שולחן/.test(msg.content)) topics.add("מסעדות");
    if (/טיסה|מלון|חופשה/.test(msg.content)) topics.add("נסיעות");
    if (/משלוח|חבילה/.test(msg.content)) topics.add("משלוחים");
    if (/תזכורת|followup/.test(msg.content)) topics.add("תזכורות");
    if (/קוד|code|bug|fix|capability/.test(msg.content)) topics.add("קוד/תכנות");
    if (/שלחתי|קבעתי|הזמנתי|ביצעתי/.test(msg.content)) actions.add("פעולות שבוצעו");
    if (/חיפוש|בדיקה|בודקת/.test(msg.content)) actions.add("חיפושים/בדיקות");
  }

  const parts: string[] = [];
  parts.push(`${messages.length} הודעות ישנות`);
  if (names.size > 0) parts.push(`משתתפים: ${[...names].slice(0, 8).join(", ")}`);
  if (topics.size > 0) parts.push(`נושאים: ${[...topics].join(", ")}`);
  if (actions.size > 0) parts.push(`${[...actions].join(", ")}`);
  return parts.join(". ");
}

// ─── Per-person group memory ─────────────────────────────────────

interface PersonGroupMemory {
  lastTopic: string;
  lastMessageAt: string;
  messageCount: number;
}

type GroupPeopleStore = Record<string, Record<string, PersonGroupMemory>>; // chatId → name → memory

const GROUP_PEOPLE_PATH = statePath("group-people.json");

function loadGroupPeople(): GroupPeopleStore {
  try {
    if (existsSync(GROUP_PEOPLE_PATH)) {
      return JSON.parse(readFileSync(GROUP_PEOPLE_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveGroupPeople(store: GroupPeopleStore): void {
  try {
    writeFileSync(GROUP_PEOPLE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch {}
}

/**
 * Track what each person talked about in a group.
 */
export function trackGroupPerson(chatId: string, personName: string, message: string): void {
  const store = loadGroupPeople();
  if (!store[chatId]) store[chatId] = {};

  const existing = store[chatId][personName] || { lastTopic: "", lastMessageAt: "", messageCount: 0 };
  existing.lastTopic = message.substring(0, 100);
  existing.lastMessageAt = new Date().toISOString();
  existing.messageCount++;
  store[chatId][personName] = existing;

  // Keep max 30 people per group
  const people = Object.keys(store[chatId]);
  if (people.length > 30) {
    const sorted = people.sort((a, b) =>
      (store[chatId][b].lastMessageAt || "").localeCompare(store[chatId][a].lastMessageAt || "")
    );
    for (const name of sorted.slice(30)) {
      delete store[chatId][name];
    }
  }

  saveGroupPeople(store);
}

/**
 * Get group people context for AI prompt.
 */
export function getGroupPeopleContext(chatId: string): string {
  const store = loadGroupPeople();
  const people = store[chatId];
  if (!people || Object.keys(people).length === 0) return "";

  const lines: string[] = ["### משתתפים בקבוצה"];
  const sorted = Object.entries(people)
    .sort((a, b) => (b[1].lastMessageAt || "").localeCompare(a[1].lastMessageAt || ""))
    .slice(0, 10);

  for (const [name, mem] of sorted) {
    const topic = mem.lastTopic.substring(0, 60);
    lines.push(`- ${name}: "${topic}" (${mem.messageCount} הודעות)`);
  }
  return lines.join("\n");
}

// ─── Core store functions (SQLite-backed) ─────────────────────────────

function saveSummary(chatId: string, summary: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO conversation_summaries (chat_id, summary, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(chat_id) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at
  `).run(chatId, summary);
}

export function getSummary(chatId: string): string {
  const db = getDb();
  const row = db.prepare("SELECT summary FROM conversation_summaries WHERE chat_id = ?").get(chatId) as { summary: string } | undefined;
  return row?.summary || "";
}

export function addMessage(chatId: string, role: "user" | "assistant", content: string): void {
  const db = getDb();
  db.prepare("INSERT INTO conversations (chat_id, role, content) VALUES (?, ?, ?)").run(chatId, role, content);

  // Trim to max history — AI-summarize dropped messages
  const maxMessages = config.maxHistory * 2;
  const count = (db.prepare("SELECT COUNT(*) as cnt FROM conversations WHERE chat_id = ?").get(chatId) as any).cnt;
  if (count > maxMessages) {
    const overflow = count - maxMessages;
    // Get the messages that will be dropped for summarization
    const dropped = db.prepare(
      "SELECT role, content FROM conversations WHERE chat_id = ? ORDER BY id ASC LIMIT ?"
    ).all(chatId, overflow) as Array<{ role: string; content: string }>;

    // AI summary in background (non-blocking)
    const droppedMsgs: Message[] = dropped.map((d) => ({ role: d.role as "user" | "assistant", content: d.content }));
    aiSummarizeDropped(chatId, droppedMsgs).catch(() => {});

    // Delete the oldest messages
    db.prepare(`
      DELETE FROM conversations WHERE id IN (
        SELECT id FROM conversations WHERE chat_id = ? ORDER BY id ASC LIMIT ?
      )
    `).run(chatId, overflow);
  }
}

export function getHistory(chatId: string): Message[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT role, content, image_data FROM conversations WHERE chat_id = ? ORDER BY id ASC"
  ).all(chatId) as Array<{ role: string; content: string; image_data: string | null }>;

  return rows.map((row) => {
    const msg: Message = {
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

export function clearHistory(chatId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM conversations WHERE chat_id = ?").run(chatId);
}

// ─── Conversation rotation ─────────────────────────────────────

/**
 * Rotate old conversations: remove conversations with no recent activity.
 * With SQLite, we can use timestamps directly instead of file mtimes.
 *
 * Call this from the daily digest scheduler.
 */
export function rotateConversations(): void {
  const db = getDb();
  const RETENTION_DAYS = 7;

  // Get total message count
  const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM conversations").get() as any;
  if (totalRow.cnt < 1000) {
    console.log(`[conversation] Rotation skipped — only ${totalRow.cnt} messages in DB`);
    return;
  }

  // Find chat_ids where the newest message is older than retention period
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const staleChatIds = db.prepare(`
    SELECT chat_id FROM conversations
    GROUP BY chat_id
    HAVING MAX(created_at) < ?
  `).all(cutoffDate) as Array<{ chat_id: string }>;

  if (staleChatIds.length === 0) {
    console.log("[conversation] Rotation: nothing to archive");
    return;
  }

  const deleteStmt = db.prepare("DELETE FROM conversations WHERE chat_id = ?");
  const tx = db.transaction(() => {
    for (const row of staleChatIds) {
      deleteStmt.run(row.chat_id);
    }
  });
  tx();

  console.log(`[conversation] Rotated ${staleChatIds.length} stale conversations`);
}
