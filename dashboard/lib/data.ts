/**
 * Data access layer — reads from the bot's workspace/state files.
 * All reads are direct file reads (no database).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const LEGACY_DIR = resolve(process.cwd(), "..", "memory");
const MEMORY_DIR = resolve(process.cwd(), "..", "workspace", "memory", "users");
const CAP_DIR = resolve(process.cwd(), "..", "workspace", "capability_requests");

/**
 * Read JSON with fallback to legacy memory/ directory.
 * Merges data from both sources when both exist (same logic as bot's state-migration).
 */
function readJSON<T>(filename: string, fallback: T): T {
  const newPath = resolve(STATE_DIR, filename);
  const oldPath = resolve(LEGACY_DIR, filename);

  let newData: T | null = null;
  let oldData: T | null = null;

  if (existsSync(newPath)) {
    try { newData = JSON.parse(readFileSync(newPath, "utf-8")); } catch {}
  }
  if (existsSync(oldPath)) {
    try { oldData = JSON.parse(readFileSync(oldPath, "utf-8")); } catch {}
  }

  // If both exist, merge
  if (newData !== null && oldData !== null) {
    return mergeData(newData, oldData);
  }
  if (newData !== null) return newData;
  if (oldData !== null) return oldData;
  return fallback;
}

function mergeData<T>(primary: T, secondary: T): T {
  // Arrays: union
  if (Array.isArray(primary) && Array.isArray(secondary)) {
    const set = new Set((primary as any[]).map(String));
    const missing = (secondary as any[]).filter((item: any) => !set.has(String(item)));
    return [...primary, ...missing] as T;
  }
  // Objects: merge missing keys from secondary
  if (typeof primary === "object" && typeof secondary === "object" && !Array.isArray(primary)) {
    const merged = { ...(secondary as any), ...(primary as any) };
    return merged as T;
  }
  return primary;
}

function readJSONStrict<T>(filename: string, fallback: T): T {
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
  requesterChatId?: string;
  requesterName?: string;
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

  const allContacts = Object.values(contacts)
    .map((c) => ({
      ...c,
      relationship: relationships[c.chatId],
      facts: facts[c.chatId],
      isApproved: approved.includes(c.chatId),
    }));

  // Dedup by phone: if same phone exists on both manual_ and real chatId, keep the real one.
  // Also dedup personal vs group chatIds with the same phone — prefer personal.
  // Dedup by phone (when phone exists), keep contacts without phone too
  const byPhone = new Map<string, ContactWithRelationship>();
  const noPhone: ContactWithRelationship[] = [];
  for (const c of allContacts) {
    const phone = c.phone?.replace(/\D/g, "");
    if (!phone) {
      // Keep contacts without phone (groups, manual entries not yet matched)
      noPhone.push(c);
      continue;
    }
    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, c);
      continue;
    }
    // Prefer non-manual over manual
    const existingIsManual = existing.chatId.startsWith("manual_");
    const newIsManual = c.chatId.startsWith("manual_");
    if (existingIsManual && !newIsManual) {
      // Merge aliases from manual entry
      if (existing.name && existing.name !== c.name) {
        c.aliases = [...(c.aliases || []), existing.name, ...(existing.aliases || [])];
      }
      byPhone.set(phone, c);
      continue;
    }
    // Prefer personal (@lid/@c.us) over group (@g.us)
    const existingIsGroup = existing.chatId.endsWith("@g.us");
    const newIsGroup = c.chatId.endsWith("@g.us");
    if (existingIsGroup && !newIsGroup) {
      byPhone.set(phone, c);
      continue;
    }
    // Otherwise keep existing (first seen)
  }

  return [...Array.from(byPhone.values()), ...noPhone]
    .sort((a, b) => {
      // Owner first
      const ownerChatId = process.env.OWNER_CHAT_ID || "";
      if (a.chatId === ownerChatId && b.chatId !== ownerChatId) return -1;
      if (b.chatId === ownerChatId && a.chatId !== ownerChatId) return 1;
      // Approved personal contacts before groups
      const aIsGroup = a.chatId.endsWith("@g.us");
      const bIsGroup = b.chatId.endsWith("@g.us");
      if (!aIsGroup && bIsGroup) return -1;
      if (aIsGroup && !bIsGroup) return 1;
      // Approved before unapproved
      if (a.isApproved && !b.isApproved) return -1;
      if (!a.isApproved && b.isApproved) return 1;
      // Then by last seen
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
}

export function getContactById(chatId: string): ContactWithRelationship | null {
  const all = getContacts();
  return all.find((c) => c.chatId === chatId) || null;
}

// --- Daily Summaries ---
export interface ChatSummary {
  chatId: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  summary: string;
  topics: string[];
  openItems: string[];
  mood: string;
}

export interface DailySummaryFile {
  date: string;
  summaries: ChatSummary[];
}

export function getDailySummaries(date?: string): DailySummaryFile | null {
  const allEntries = readJSONStrict<DailySummaryFile[]>("daily-summaries.json", []);
  if (!date) {
    // Return most recent
    return allEntries.length > 0 ? allEntries[allEntries.length - 1] : null;
  }
  return allEntries.find((e) => e.date === date) || null;
}

export function getAvailableSummaryDates(): string[] {
  const allEntries = readJSONStrict<DailySummaryFile[]>("daily-summaries.json", []);
  return allEntries.map((e) => e.date).reverse();
}

// --- Deliveries ---
export interface DeliveryStoreEntry {
  id: string;
  carrier: string;
  trackingNumber?: string;
  summary: string;
  smsText: string;
  sender: string;
  smsTimestamp: string;
  status: "pending" | "received";
  receivedAt?: string;
}

export function getDeliveryStore(): DeliveryStoreEntry[] {
  return readJSONStrict<DeliveryStoreEntry[]>("deliveries.json", []);
}

// --- Logs ---
export interface LogLine {
  raw: string;
  timestamp?: string;
  level?: string;
  domain?: string;
  message?: string;
}

const LOG_PATH = resolve(STATE_DIR, "limor.log");

export function getLogs(limit: number = 200, level?: string, domain?: string): LogLine[] {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const content = readFileSync(LOG_PATH, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    // Parse and keep only structured log lines (skip QR codes, stack traces, raw text)
    let parsed: LogLine[] = [];
    for (const raw of lines) {
      const match = raw.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.*)$/);
      if (match) {
        parsed.push({ raw, timestamp: match[1], level: match[2], domain: match[3], message: match[4] });
      }
    }

    // Filter by level/domain
    if (level) {
      parsed = parsed.filter((l) => l.level?.toUpperCase() === level.toUpperCase());
    }
    if (domain) {
      parsed = parsed.filter((l) => l.domain === domain);
    }

    // Return last N, reversed (newest first)
    return parsed.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export function isLimorRunning(): boolean {
  // Try pm2 first
  try {
    const { execSync } = require("child_process");
    const BOT_DIR = resolve(process.cwd(), "..");
    const pm2Result = execSync("npx pm2 jlist 2>/dev/null", { encoding: "utf-8", cwd: BOT_DIR, timeout: 5000 }).trim();
    const processes = JSON.parse(pm2Result);
    const limor = processes.find((p: any) => p.name === "limor" && p.pm2_env?.status === "online");
    if (limor) return true;
  } catch {}
  // Fallback: check pgrep
  try {
    const { execSync } = require("child_process");
    const result = execSync("pgrep -f 'node dist/index.js'", { encoding: "utf-8" }).trim();
    if (result.length > 0) return true;
  } catch {}
  // Fallback: log freshness
  if (!existsSync(LOG_PATH)) return false;
  try {
    const stats = require("fs").statSync(LOG_PATH);
    return Date.now() - stats.mtimeMs < 5 * 60 * 1000;
  } catch {
    return false;
  }
}
