import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";

const MUTED_FILE = resolve(__dirname, "..", "workspace", "state", "groups.json");
const OLD_MUTED_FILE = resolve(__dirname, "..", "data", "muted-groups.json");

interface MutedGroups {
  [chatId: string]: {
    name: string;
    mutedAt: string;
  };
}

// In-memory map of group names → chatIds (populated by whatsapp.ts)
const groupNameMap = new Map<string, string>();

export function registerGroup(name: string, chatId: string): void {
  groupNameMap.set(name, chatId);
}

export function findGroupChatId(name: string): string | undefined {
  // Exact match
  for (const [groupName, chatId] of groupNameMap) {
    if (groupName === name) return chatId;
  }
  // Partial match
  for (const [groupName, chatId] of groupNameMap) {
    if (groupName.includes(name) || name.includes(groupName)) return chatId;
  }
  return undefined;
}

function load(): MutedGroups {
  return loadWithFallback<MutedGroups>(MUTED_FILE, OLD_MUTED_FILE, {});
}

function save(data: MutedGroups): void {
  writeFileSync(MUTED_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function muteGroup(chatId: string, name: string): void {
  const data = load();
  data[chatId] = { name, mutedAt: new Date().toISOString() };
  save(data);
}

export function unmuteGroup(chatId: string): void {
  const data = load();
  delete data[chatId];
  save(data);
}

export function isGroupMuted(chatId: string): boolean {
  const data = load();
  return chatId in data;
}

export function getMutedGroups(): { chatId: string; name: string }[] {
  const data = load();
  return Object.entries(data).map(([chatId, info]) => ({
    chatId,
    name: info.name,
  }));
}
