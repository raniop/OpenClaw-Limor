import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const APPROVED_PATH = resolve(__dirname, "..", "workspace", "state", "approved.json");
const PENDING_PATH = resolve(__dirname, "..", "workspace", "state", "pending.json");

interface PendingEntry {
  chatId: string;
  phone: string;
  createdAt: string;
}

// The code (key) is the human-readable approval ID
type PendingStore = Record<string, PendingEntry>;

function loadApproved(): string[] {
  if (!existsSync(APPROVED_PATH)) return [];
  try {
    return JSON.parse(readFileSync(APPROVED_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveApproved(approved: string[]): void {
  writeFileSync(APPROVED_PATH, JSON.stringify(approved, null, 2), "utf-8");
}

function loadPending(): PendingStore {
  if (!existsSync(PENDING_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PENDING_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function savePending(pending: PendingStore): void {
  writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), "utf-8");
}

export function isApproved(chatId: string): boolean {
  const approved = loadApproved();
  return approved.includes(chatId);
}

export function addApproved(chatId: string): void {
  const approved = loadApproved();
  if (!approved.includes(chatId)) {
    approved.push(chatId);
    saveApproved(approved);
  }
}

export function removeApproved(chatId: string): boolean {
  const approved = loadApproved();
  const index = approved.indexOf(chatId);
  if (index === -1) return false;
  approved.splice(index, 1);
  saveApproved(approved);
  return true;
}

export function isPending(chatId: string): boolean {
  const pending = loadPending();
  return Object.values(pending).some((p) => p.chatId === chatId);
}

/** Add a pending contact. Returns the approval code. */
export function addPending(chatId: string, phone: string): string {
  const pending = loadPending();
  // Don't add duplicate — return existing code
  const existingCode = Object.keys(pending).find((k) => pending[k].chatId === chatId);
  if (existingCode) return existingCode;

  const code = generateCode();
  pending[code] = {
    chatId,
    phone,
    createdAt: new Date().toISOString(),
  };
  savePending(pending);
  return code;
}

export function getPendingByChatId(chatId: string): PendingEntry | null {
  const pending = loadPending();
  return Object.values(pending).find((p) => p.chatId === chatId) || null;
}

/** Look up a pending entry by its approval code. */
export function getPendingByCode(code: string): (PendingEntry & { code: string }) | null {
  const pending = loadPending();
  const upper = code.toUpperCase();
  const entry = pending[upper];
  if (!entry) return null;
  return { ...entry, code: upper };
}

/** Approve a pending contact by its code. Returns the entry or null. */
export function approveByCode(code: string): PendingEntry | null {
  const pending = loadPending();
  const upper = code.toUpperCase();
  const entry = pending[upper];
  if (!entry) return null;

  addApproved(entry.chatId);
  delete pending[upper];
  savePending(pending);
  return entry;
}

/** Reject (remove) a pending contact by its code. Returns the entry or null. */
export function rejectByCode(code: string): PendingEntry | null {
  const pending = loadPending();
  const upper = code.toUpperCase();
  const entry = pending[upper];
  if (!entry) return null;

  delete pending[upper];
  savePending(pending);
  return entry;
}

// Keep for backward compat — used as legacy fallback
export function approveByChatId(chatId: string): boolean {
  const pending = loadPending();
  const code = Object.keys(pending).find((k) => pending[k].chatId === chatId);
  if (!code) return false;

  addApproved(chatId);
  delete pending[code];
  savePending(pending);
  return true;
}

/** Get the last pending entry with its code. Legacy fallback. */
export function getLastPending(): (PendingEntry & { code: string }) | null {
  const pending = loadPending();
  const entries = Object.entries(pending);
  if (entries.length === 0) return null;
  const [code, entry] = entries[entries.length - 1];
  return { ...entry, code };
}

/** Count pending entries. */
export function getPendingCount(): number {
  const pending = loadPending();
  return Object.keys(pending).length;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
