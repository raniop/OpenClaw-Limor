import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";
import { statePath } from "./state-dir";

const OLD_MUTED_FILE = resolve(__dirname, "..", "data", "muted-groups.json");

interface MutedGroups {
  [chatId: string]: {
    name: string;
    mutedAt: string;
  };
}

interface GroupRegistry {
  [chatId: string]: string; // chatId → name
}

// Persisted group name → chatId registry (survives restarts)

function loadRegistry(): GroupRegistry {
  try {
    const { readFileSync, existsSync } = require("fs");
    if (existsSync(statePath("group_registry.json"))) {
      return JSON.parse(readFileSync(statePath("group_registry.json"), "utf-8"));
    }
  } catch {}
  return {};
}

function saveRegistry(registry: GroupRegistry): void {
  writeFileSync(statePath("group_registry.json"), JSON.stringify(registry, null, 2), "utf-8");
}

// In-memory cache (initialized from file)
let groupRegistry: GroupRegistry = loadRegistry();

export function registerGroup(name: string, chatId: string): void {
  if (groupRegistry[chatId] !== name) {
    groupRegistry[chatId] = name;
    saveRegistry(groupRegistry);
  }
}

export function findGroupChatId(name: string): string | undefined {
  // Exact match
  for (const [chatId, groupName] of Object.entries(groupRegistry)) {
    if (groupName === name) return chatId;
  }
  // Partial match
  for (const [chatId, groupName] of Object.entries(groupRegistry)) {
    if (groupName.includes(name) || name.includes(groupName)) return chatId;
  }
  return undefined;
}

function load(): MutedGroups {
  return loadWithFallback<MutedGroups>(statePath("groups.json"), OLD_MUTED_FILE, {});
}

function save(data: MutedGroups): void {
  writeFileSync(statePath("groups.json"), JSON.stringify(data, null, 2), "utf-8");
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
  return Object.entries(data).map(([chatId, info]) => ({ chatId, name: info.name }));
}
