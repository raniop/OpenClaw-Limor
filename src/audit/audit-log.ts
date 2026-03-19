/**
 * Audit log — ring-buffer style activity log persisted to JSON.
 * Records tool calls, approvals, meeting decisions, messages sent, capability actions.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
const MAX_ENTRIES = 500;

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  result: string;
  metadata?: Record<string, any>;
}

function ensureDir(): void {
  const dir = dirname(statePath("audit-log.json"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readLog(): AuditEntry[] {
  ensureDir();
  const p = statePath("audit-log.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeLog(entries: AuditEntry[]): void {
  ensureDir();
  writeFileSync(statePath("audit-log.json"), JSON.stringify(entries, null, 2), "utf-8");
}

export function logAudit(
  actor: string,
  action: string,
  target: string,
  result: string,
  metadata?: Record<string, any>
): void {
  const entries = readLog();
  entries.push({
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
    result,
    metadata,
  });
  // Keep only the last MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  writeLog(entries);
}

export function getRecentActivity(limit: number = 20): AuditEntry[] {
  const entries = readLog();
  return entries.slice(-limit);
}

export function getActivitySince(since: Date): AuditEntry[] {
  const entries = readLog();
  const sinceISO = since.toISOString();
  return entries.filter((e) => e.timestamp >= sinceISO);
}
