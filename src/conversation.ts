import { writeFileSync } from "fs";
import { resolve } from "path";
import { config } from "./config";
import { loadWithFallback } from "./state-migration";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

const HISTORY_PATH = resolve(__dirname, "..", "workspace", "state", "conversations.json");
const OLD_HISTORY_PATH = resolve(__dirname, "..", "memory", "conversations.json");

type ConversationStore = Record<string, Message[]>;

function loadStore(): ConversationStore {
  return loadWithFallback<ConversationStore>(HISTORY_PATH, OLD_HISTORY_PATH, {});
}

function saveStore(store: ConversationStore): void {
  writeFileSync(HISTORY_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function addMessage(chatId: string, role: "user" | "assistant", content: string): void {
  const store = loadStore();
  if (!store[chatId]) {
    store[chatId] = [];
  }

  store[chatId].push({ role, content });

  // Trim to max history (keep pairs to maintain alternation)
  while (store[chatId].length > config.maxHistory * 2) {
    store[chatId].shift();
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
