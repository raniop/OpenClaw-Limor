/**
 * File-based follow-up store.
 * Persists follow-up entries to workspace/state/followups.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type { FollowupEntry } from "./followup-types";

function ensureDir(): void {
  const dir = dirname(statePath("followups.json"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): FollowupEntry[] {
  ensureDir();
  const p = statePath("followups.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: FollowupEntry[]): void {
  ensureDir();
  writeFileSync(statePath("followups.json"), JSON.stringify(entries, null, 2), "utf-8");
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
  requesterName?: string,
  targetChatId?: string,
  targetName?: string,
  targetMessage?: string
): FollowupEntry | null {
  const entries = readStore();
  const dueIso = dueAt.toISOString();

  // ─── Dedup: skip if a similar pending reminder already exists ──────
  // Match by: same dueAt (within 5 min window) + similar reason or same target
  const dueMs = dueAt.getTime();
  const FIVE_MIN = 5 * 60 * 1000;
  const reasonLower = reason.toLowerCase();
  const isDuplicate = entries.some((e) => {
    if (e.status !== "pending") return false;
    const existingMs = new Date(e.dueAt).getTime();
    if (Math.abs(existingMs - dueMs) > FIVE_MIN) return false;
    // Must be same target (both to owner, or both to same contact)
    const existingTarget = e.targetChatId || "owner";
    const newTarget = targetChatId || "owner";
    if (existingTarget !== newTarget) return false;
    // Same reason text (fuzzy — strip prefix and compare core)
    const existingReason = e.reason.replace(/^\[מ-[^\]]*\]\s*/, "").toLowerCase();
    const newReason = reason.replace(/^\[מ-[^\]]*\]\s*/, "").toLowerCase();
    if (existingReason === newReason) return true;
    return false;
  });

  if (isDuplicate) {
    console.log(`[followups] Dedup: skipped duplicate reminder "${reason.substring(0, 60)}" at ${dueIso}`);
    return null;
  }

  const entry: FollowupEntry = {
    id: generateId(),
    chatId,
    contactName,
    reason,
    dueAt: dueIso,
    createdAt: new Date().toISOString(),
    status: "pending",
    requesterChatId,
    requesterName,
    targetChatId,
    targetName,
    targetMessage,
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

export function deleteFollowup(id: string): FollowupEntry | null {
  const entries = readStore();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const [removed] = entries.splice(idx, 1);
  writeStore(entries);
  return removed;
}

export function deleteFollowupByKeyword(keyword: string): FollowupEntry | null {
  const entries = readStore();
  const lower = keyword.toLowerCase();
  const idx = entries.findIndex(
    (e) => e.status === "pending" && e.reason.toLowerCase().includes(lower)
  );
  if (idx === -1) return null;
  const [removed] = entries.splice(idx, 1);
  writeStore(entries);
  return removed;
}
