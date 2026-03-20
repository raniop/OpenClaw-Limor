import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { config } from "./config";
import { loadWithFallback } from "./state-migration";
import { statePath } from "./state-dir";

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
