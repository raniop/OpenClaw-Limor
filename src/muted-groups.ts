import { writeFileSync, readFileSync, existsSync } from "fs";
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

export function getGroupNameById(chatId: string): string | undefined {
  return groupRegistry[chatId];
}

/** Normalize for fuzzy matching: lowercase, strip emoji/punct/whitespace. */
function normalizeGroupName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function findGroupChatId(name: string): string | undefined {
  const entries = Object.entries(groupRegistry);
  // 1. Exact match
  for (const [chatId, groupName] of entries) {
    if (groupName === name) return chatId;
  }
  // 2. Case-insensitive / normalized match
  const nq = normalizeGroupName(name);
  if (nq) {
    for (const [chatId, groupName] of entries) {
      if (normalizeGroupName(groupName) === nq) return chatId;
    }
    // 3. Partial normalized match (either direction)
    for (const [chatId, groupName] of entries) {
      const ng = normalizeGroupName(groupName);
      if (ng && (ng.includes(nq) || nq.includes(ng))) return chatId;
    }
  }
  // 4. Original substring match (kept for backward compat)
  for (const [chatId, groupName] of entries) {
    if (groupName.includes(name) || name.includes(groupName)) return chatId;
  }
  return undefined;
}

/** Get all registered groups (chatId + name). For listing to AI. */
export function listAllRegisteredGroups(): Array<{ chatId: string; name: string }> {
  return Object.entries(groupRegistry).map(([chatId, name]) => ({ chatId, name }));
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
