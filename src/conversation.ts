import { writeFileSync, readFileSync, existsSync } from "fs";
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

type ConversationStore = Record<string, Message[]>;

function loadStore(): ConversationStore {
  return loadWithFallback<ConversationStore>(statePath("conversations.json"), OLD_HISTORY_PATH, {});
}

function saveStore(store: ConversationStore): void {
  writeFileSync(statePath("conversations.json"), JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Build a quick summary of messages being dropped from history.
 * Deterministic — no AI calls.
 */
function summarizeDroppedMessages(messages: Message[]): string {
  if (messages.length === 0) return "";
  const topics = new Set<string>();
  const names = new Set<string>();

  for (const msg of messages) {
    // Extract group sender names
    const nameMatch = msg.content.match(/^\[([^\]]+)\]:/);
    if (nameMatch) names.add(nameMatch[1]);

    // Extract rough topics from keywords
    if (/פגישה|יומן|meeting|calendar/.test(msg.content)) topics.add("פגישות");
    if (/מסעדה|הזמנה|שולחן/.test(msg.content)) topics.add("מסעדות");
    if (/טיסה|מלון|חופשה/.test(msg.content)) topics.add("נסיעות");
    if (/משלוח|חבילה/.test(msg.content)) topics.add("משלוחים");
    if (/תזכורת|followup/.test(msg.content)) topics.add("תזכורות");
    if (/קוד|code|bug|fix/.test(msg.content)) topics.add("קוד/תכנות");
  }

  const parts: string[] = [];
  parts.push(`${messages.length} הודעות ישנות שלא נראות בהיסטוריה`);
  if (names.size > 0) parts.push(`משתתפים: ${[...names].slice(0, 5).join(", ")}`);
  if (topics.size > 0) parts.push(`נושאים: ${[...topics].join(", ")}`);
  return parts.join(". ");
}

/**
 * Save a conversation summary for a chat when messages are trimmed.
 */
function saveSummary(chatId: string, summary: string): void {
  try {
    const { mkdirSync } = require("fs");
    if (!existsSync(SUMMARIES_DIR)) mkdirSync(SUMMARIES_DIR, { recursive: true });
    const sanitized = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
    writeFileSync(join(SUMMARIES_DIR, `${sanitized}.txt`), summary, "utf-8");
  } catch {}
}

/**
 * Load a conversation summary for a chat if it exists.
 */
export function getSummary(chatId: string): string {
  try {
    const sanitized = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = join(SUMMARIES_DIR, `${sanitized}.txt`);
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

  // Trim to max history — summarize dropped messages first
  const maxMessages = config.maxHistory * 2;
  if (store[chatId].length > maxMessages) {
    const overflow = store[chatId].length - maxMessages;
    const dropped = store[chatId].slice(0, overflow);
    const summary = summarizeDroppedMessages(dropped);
    if (summary) saveSummary(chatId, summary);

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
