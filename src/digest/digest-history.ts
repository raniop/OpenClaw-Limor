/**
 * Digest history — stores every generated digest for dashboard viewing.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
const MAX_ENTRIES = 90; // ~3 months of daily digests

export interface DigestHistoryEntry {
  id: string;
  timestamp: string;
  text: string;
  metadata?: {
    urgentCount: number;
    waitingCount: number;
    meetingsCount: number;
    followupsCount: number;
  };
}

function ensureDir(): void {
  const dir = dirname(statePath("digest-history.json"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): DigestHistoryEntry[] {
  ensureDir();
  const p = statePath("digest-history.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: DigestHistoryEntry[]): void {
  ensureDir();
  writeFileSync(statePath("digest-history.json"), JSON.stringify(entries, null, 2), "utf-8");
}

export function saveDigest(text: string, metadata?: DigestHistoryEntry["metadata"]): DigestHistoryEntry {
  const entries = readStore();
  const entry: DigestHistoryEntry = {
    id: `dig-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    text,
    metadata,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  writeStore(entries);
  return entry;
}

export function getDigestHistory(limit: number = 30): DigestHistoryEntry[] {
  return readStore().slice(-limit);
}

export function getDigestById(id: string): DigestHistoryEntry | null {
  return readStore().find((e) => e.id === id) || null;
}
