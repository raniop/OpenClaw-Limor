/**
 * Data access layer — reads from the bot's workspace/state files.
 * All reads are direct file reads (no database).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const MEMORY_DIR = resolve(process.cwd(), "..", "workspace", "memory", "users");
const CAP_DIR = resolve(process.cwd(), "..", "workspace", "capability_requests");

function readJSON<T>(filename: string, fallback: T): T {
  const path = resolve(STATE_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filename: string, data: any): void {
  const path = resolve(STATE_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// --- Approvals ---
export interface PendingEntry {
  chatId: string;
  phone: string;
  createdAt: string;
}

export function getPendingApprovals(): Array<PendingEntry & { code: string }> {
  const pending: Record<string, PendingEntry> = readJSON("pending.json", {});
  return Object.entries(pending).map(([code, entry]) => ({ ...entry, code }));
}

export function getApprovedContacts(): string[] {
  return readJSON<string[]>("approved.json", []);
}

export function approveByCode(code: string): boolean {
  const pending: Record<string, PendingEntry> = readJSON("pending.json", {});
  const entry = pending[code];
  if (!entry) return false;

  // Add to approved
  const approved: string[] = readJSON("approved.json", []);
  if (!approved.includes(entry.chatId)) {
    approved.push(entry.chatId);
    writeJSON("approved.json", approved);
  }

  // Remove from pending
  delete pending[code];
  writeJSON("pending.json", pending);
  return true;
}

export function rejectByCode(code: string): boolean {
  const pending: Record<string, PendingEntry> = readJSON("pending.json", {});
  if (!pending[code]) return false;
  delete pending[code];
  writeJSON("pending.json", pending);
  return true;
}

// --- Followups ---
export interface FollowupEntry {
  id: string;
  chatId: string;
  contactName: string;
  reason: string;
  dueAt: string;
  createdAt: string;
  status: "pending" | "completed";
}

export function getFollowups(): FollowupEntry[] {
  return readJSON<FollowupEntry[]>("followups.json", []);
}

export function completeFollowup(id: string): boolean {
  const followups = getFollowups();
  const entry = followups.find((f) => f.id === id);
  if (!entry) return false;
  entry.status = "completed";
  writeJSON("followups.json", followups);
  return true;
}

// --- Activity Log ---
export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  result: string;
  metadata?: Record<string, any>;
}

export function getActivityLog(limit: number = 50): AuditEntry[] {
  const entries = readJSON<AuditEntry[]>("audit-log.json", []);
  return entries.slice(-limit).reverse();
}

// --- Capabilities ---
export interface CapabilitySpec {
  id: string;
  title: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  level: string;
  problem: string;
  proposedSolution: string;
}

function parseCapSpec(content: string, id: string): CapabilitySpec | null {
  try {
    const getField = (label: string): string => {
      const match = content.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`));
      return match ? match[1].trim() : "";
    };
    const getSection = (header: string): string => {
      const match = content.match(new RegExp(`## ${header}\\n([\\s\\S]*?)(?=\\n## |$)`));
      return match ? match[1].trim() : "";
    };
    return {
      id,
      title: content.match(/^# (.+)/m)?.[1] || "Untitled",
      status: getField("Status") || "pending",
      requestedBy: getField("Requested by"),
      createdAt: getField("Created"),
      level: getField("Level") || "code_change",
      problem: getSection("Problem"),
      proposedSolution: getSection("Proposed Solution"),
    };
  } catch {
    return null;
  }
}

export function getCapabilities(): CapabilitySpec[] {
  const specs: CapabilitySpec[] = [];
  for (const status of ["pending", "approved", "rejected"]) {
    const dir = join(CAP_DIR, status);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(dir, file), "utf-8");
      const spec = parseCapSpec(content, file.replace(".md", ""));
      if (spec) specs.push(spec);
    }
  }
  return specs;
}

export function approveCapability(id: string): boolean {
  return moveCapSpec(id, "pending", "approved");
}

export function rejectCapability(id: string): boolean {
  return moveCapSpec(id, "pending", "rejected");
}

function moveCapSpec(id: string, from: string, to: string): boolean {
  const fromPath = join(CAP_DIR, from, `${id}.md`);
  const toPath = join(CAP_DIR, to, `${id}.md`);
  if (!existsSync(fromPath)) return false;
  const content = readFileSync(fromPath, "utf-8")
    .replace(/\*\*Status\*\*:\s*\w+/, `**Status**: ${to}`);
  writeFileSync(toPath, content, "utf-8");
  const { unlinkSync } = require("fs");
  unlinkSync(fromPath);
  return true;
}

// --- Digest History ---
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

export function getDigestHistory(): DigestHistoryEntry[] {
  return readJSON<DigestHistoryEntry[]>("digest-history.json", []).reverse();
}

// --- Contacts with Relationship Data ---
export interface ContactEntry {
  chatId: string;
  name: string;
  aliases?: string[];
  phone: string;
  lastSeen: string;
}

export interface RelationshipProfile {
  chatId: string;
  name: string;
  relationshipType: string;
  importanceScore: number;
  communicationStyle: string;
  notes: string[];
  lastInteractionAt?: string;
  interactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithRelationship extends ContactEntry {
  relationship?: RelationshipProfile;
  facts?: string[];
  isApproved: boolean;
}

export function getContacts(): ContactWithRelationship[] {
  const contacts: Record<string, ContactEntry> = readJSON("contacts.json", {});
  const relationships: Record<string, RelationshipProfile> = readJSON("relationships.json", {});
  const approved: string[] = readJSON("approved.json", []);

  // Read user facts
  const facts: Record<string, string[]> = {};
  if (existsSync(MEMORY_DIR)) {
    for (const file of readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"))) {
      const chatId = file.replace(".md", "").replace(/_/g, "@").replace(/@c_us$/, "@c.us").replace(/@g_us$/, "@g.us");
      try {
        const content = readFileSync(join(MEMORY_DIR, file), "utf-8");
        const factLines = content.split("\n")
          .filter((l) => l.startsWith("- "))
          .map((l) => l.substring(2).replace(/\s*\(saved:.*\)$/, "").trim());
        if (factLines.length > 0) facts[chatId] = factLines;
      } catch {}
    }
  }

  return Object.values(contacts)
    .map((c) => ({
      ...c,
      relationship: relationships[c.chatId],
      facts: facts[c.chatId],
      isApproved: approved.includes(c.chatId),
    }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

export function getContactById(chatId: string): ContactWithRelationship | null {
  const all = getContacts();
  return all.find((c) => c.chatId === chatId) || null;
}
