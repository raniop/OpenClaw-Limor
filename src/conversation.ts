import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { config } from "./config";
import { loadWithFallback } from "./state-migration";
import { statePath, getStateDir } from "./state-dir";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

const OLD_HISTORY_PATH = resolve(__dirname, "..", "memory", "conversations.json");
const SUMMARIES_DIR = statePath("conversation-summaries");

// Ensure summaries dir exists
try { if (!existsSync(SUMMARIES_DIR)) mkdirSync(SUMMARIES_DIR, { recursive: true }); } catch {}

type ConversationStore = Record<string, Message[]>;

function loadStore(): ConversationStore {
  return loadWithFallback<ConversationStore>(statePath("conversations.json"), OLD_HISTORY_PATH, {});
}

function saveStore(store: ConversationStore): void {
  writeFileSync(statePath("conversations.json"), JSON.stringify(store, null, 2), "utf-8");
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
    const { client } = require("./ai/client");

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

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b: any) => b.type === "text")?.text || "";
    if (text.length > 10) {
      saveSummary(chatId, text);
      console.log(`[conversation] AI summary updated for ${sanitize(chatId)} (${messages.length} messages → ${text.length} chars)`);
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

// ─── Core store functions ─────────────────────────────────────

function sanitize(chatId: string): string {
  return chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function saveSummary(chatId: string, summary: string): void {
  try {
    writeFileSync(join(SUMMARIES_DIR, `${sanitize(chatId)}.txt`), summary, "utf-8");
  } catch {}
}

export function getSummary(chatId: string): string {
  try {
    const path = join(SUMMARIES_DIR, `${sanitize(chatId)}.txt`);
    if (existsSync(path)) return readFileSync(path, "utf-8");
  } catch {}
  return "";
}

export function addMessage(chatId: string, role: "user" | "assistant", content: string): void {
  const store = loadStore();
  if (!store[chatId]) {
    store[chatId] = [];
  }

  store[chatId].push({ role, content });

  // Trim to max history — AI-summarize dropped messages
  const maxMessages = config.maxHistory * 2;
  if (store[chatId].length > maxMessages) {
    const overflow = store[chatId].length - maxMessages;
    const dropped = store[chatId].slice(0, overflow);

    // AI summary in background (non-blocking)
    aiSummarizeDropped(chatId, dropped).catch(() => {});

    store[chatId] = store[chatId].slice(overflow);
  }

  saveStore(store);
}

export function getHistory(chatId: string): Message[] {
  const store = loadStore();
  return store[chatId] || [];
}

export function clearHistory(chatId: string): void {
  const store = loadStore();
  delete store[chatId];
  saveStore(store);
}

// ─── Conversation rotation ─────────────────────────────────────

const MAX_CONVERSATIONS_SIZE = 500 * 1024; // 500KB
const RETENTION_DAYS = 7;

/**
 * Rotate conversations.json: archive conversations with no activity in the
 * last 7 days when the file exceeds 500KB. Archived conversations are stored
 * in workspace/state/conversations-archive-YYYY-MM.json.
 *
 * Call this from the daily digest scheduler.
 */
export function rotateConversations(): void {
  const mainPath = statePath("conversations.json");
  if (!existsSync(mainPath)) return;

  let fileSize: number;
  try {
    fileSize = statSync(mainPath).size;
  } catch {
    return;
  }

  if (fileSize < MAX_CONVERSATIONS_SIZE) {
    console.log(`[conversation] Rotation skipped — file ${(fileSize / 1024).toFixed(0)}KB < 500KB`);
    return;
  }

  const store = loadStore();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const now = new Date();
  const archiveKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const archivePath = statePath(`conversations-archive-${archiveKey}.json`);

  // Load existing archive (if any)
  let archive: ConversationStore = {};
  try {
    if (existsSync(archivePath)) {
      archive = JSON.parse(readFileSync(archivePath, "utf-8"));
    }
  } catch {}

  let archivedCount = 0;

  for (const chatId of Object.keys(store)) {
    const messages = store[chatId];
    if (!messages || messages.length === 0) {
      delete store[chatId];
      continue;
    }

    // Check if last message is older than retention period by looking at
    // the conversation summary timestamp or using a heuristic: if the
    // conversation has no recent messages, we consider it stale.
    // Since messages don't have timestamps, we use the summary file mtime.
    const summaryPath = join(SUMMARIES_DIR, `${sanitize(chatId)}.txt`);
    let lastActivity = 0;
    try {
      if (existsSync(summaryPath)) {
        lastActivity = statSync(summaryPath).mtimeMs;
      }
    } catch {}

    // If no summary file or it's old, check the main conversations file mtime as fallback
    if (lastActivity === 0) {
      // No summary — treat as potentially stale; archive if file is big
      // Use a conservative approach: only archive if we have many conversations
      if (Object.keys(store).length <= 10) continue;
    }

    if (lastActivity > 0 && lastActivity >= cutoff) continue; // Recent — keep

    // Archive this conversation
    archive[chatId] = messages;
    delete store[chatId];
    archivedCount++;
  }

  if (archivedCount > 0) {
    writeFileSync(archivePath, JSON.stringify(archive, null, 2), "utf-8");
    saveStore(store);
    console.log(`[conversation] Rotated ${archivedCount} conversations to ${archivePath}`);
  } else {
    console.log("[conversation] Rotation: nothing to archive");
  }
}
