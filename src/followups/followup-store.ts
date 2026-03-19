/**
 * File-based follow-up store.
 * Persists follow-up entries to workspace/state/followups.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import type { FollowupEntry } from "./followup-types";

const STORE_PATH = resolve(__dirname, "..", "..", "workspace", "state", "followups.json");

function ensureDir(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): FollowupEntry[] {
  ensureDir();
  if (!existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: FollowupEntry[]): void {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `fu-${ts}-${rand}`;
}

export function addFollowup(
  chatId: string,
  contactName: string,
  reason: string,
  dueAt: Date,
  requesterChatId?: string,
  requesterName?: string
): FollowupEntry {
  const entries = readStore();
  const entry: FollowupEntry = {
    id: generateId(),
    chatId,
    contactName,
    reason,
    dueAt: dueAt.toISOString(),
    createdAt: new Date().toISOString(),
    status: "pending",
    requesterChatId,
    requesterName,
  };
  entries.push(entry);
  writeStore(entries);
  return entry;
}

export function getPendingFollowups(): FollowupEntry[] {
  return readStore().filter((e) => e.status === "pending");
}

export function getDueFollowups(): FollowupEntry[] {
  const now = new Date().toISOString();
  return readStore().filter((e) => e.status === "pending" && e.dueAt <= now);
}

export function completeFollowup(id: string): FollowupEntry | null {
  const entries = readStore();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = "completed";
  writeStore(entries);
  return entry;
}
