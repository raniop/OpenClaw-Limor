import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const APPROVED_PATH = resolve(__dirname, "..", "workspace", "state", "approved.json");
const PENDING_PATH = resolve(__dirname, "..", "workspace", "state", "pending.json");

interface PendingEntry {
  chatId: string;
  phone: string;
  createdAt: string;
}

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

export function addPending(chatId: string, phone: string): void {
  const pending = loadPending();
  // Don't add duplicate
  if (Object.values(pending).some((p) => p.chatId === chatId)) return;

  const code = generateCode();
  pending[code] = {
    chatId,
    phone,
    createdAt: new Date().toISOString(),
  };
  savePending(pending);
}

export function getPendingByChatId(chatId: string): PendingEntry | null {
  const pending = loadPending();
  return Object.values(pending).find((p) => p.chatId === chatId) || null;
}

export function approveByChatId(chatId: string): boolean {
  const pending = loadPending();
  const code = Object.keys(pending).find((k) => pending[k].chatId === chatId);
  if (!code) return false;

  addApproved(chatId);
  delete pending[code];
  savePending(pending);
  return true;
}

export function getLastPending(): PendingEntry | null {
  const pending = loadPending();
  const entries = Object.values(pending);
  if (entries.length === 0) return null;
  return entries[entries.length - 1];
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
