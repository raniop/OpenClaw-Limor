/**
 * Delivery Store — tracks delivery SMS messages and their status.
 * Persists to workspace/state/deliveries.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";

export interface DeliveryEntry {
  id: string;
  smsId: number;
  carrier: string;
  trackingNumber?: string;
  summary: string;
  smsText: string;
  sender: string;
  smsTimestamp: string;
  status: "pending" | "received";
  createdAt: string;
  receivedAt?: string;
  emailOrderId?: string; // Cross-reference to EmailOrder.id from email detection
}

function getPath(): string {
  return statePath("deliveries.json");
}

function ensureDir(): void {
  const dir = dirname(getPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): DeliveryEntry[] {
  ensureDir();
  const p = getPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: DeliveryEntry[]): void {
  ensureDir();
  writeFileSync(getPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `del-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Add a new delivery entry (from SMS detection).
 * Skips if an entry with the same smsId already exists.
 */
export function addDelivery(
  smsId: number,
  carrier: string,
  summary: string,
  smsText: string,
  sender: string,
  smsTimestamp: string,
  trackingNumber?: string
): DeliveryEntry | null {
  const entries = readStore();
  // Dedup by smsId
  if (entries.some((e) => e.smsId === smsId)) return null;
  // Dedup by tracking number — if same tracking already exists (any status), skip
  if (trackingNumber && entries.some((e) => e.trackingNumber === trackingNumber)) {
    // Update existing entry if the new one has more info (e.g., status change)
    return null;
  }
  // Dedup: same carrier already has an entry with tracking — skip this one without tracking
  if (!trackingNumber && entries.some((e) => e.carrier === carrier && e.trackingNumber)) return null;
  // Dedup by carrier + time window (30 min) — multiple SMS from same carrier about same delivery
  const DEDUP_WINDOW_MS = 30 * 60 * 1000;
  const tsMs = new Date(smsTimestamp).getTime();
  if (tsMs && entries.some((e) => {
    if (e.carrier !== carrier) return false;
    const existingTs = new Date(e.smsTimestamp).getTime();
    return existingTs && Math.abs(tsMs - existingTs) < DEDUP_WINDOW_MS;
  })) return null;
  const entry: DeliveryEntry = {
    id: generateId(),
    smsId,
    carrier,
    trackingNumber,
    summary,
    smsText: smsText.substring(0, 500),
    sender,
    smsTimestamp,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  writeStore(entries);
  return entry;
}

/**
 * Mark a delivery as received.
 */
export function markReceived(id: string): DeliveryEntry | null {
  const entries = readStore();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = "received";
  entry.receivedAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}

/**
 * Mark a delivery as received by tracking number or carrier match.
 */
export function markReceivedByMatch(keyword: string): DeliveryEntry | null {
  const entries = readStore();
  const lower = keyword.toLowerCase();
  const entry = entries.find(
    (e) =>
      e.status === "pending" &&
      (e.trackingNumber?.toLowerCase().includes(lower) ||
        e.carrier.toLowerCase().includes(lower) ||
        e.summary.toLowerCase().includes(lower) ||
        e.smsText.toLowerCase().includes(lower))
  );
  if (!entry) return null;
  entry.status = "received";
  entry.receivedAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}

/**
 * Get all deliveries, optionally filtered by status.
 */
export function getDeliveries(status?: "pending" | "received"): DeliveryEntry[] {
  const entries = readStore();
  if (status) return entries.filter((e) => e.status === status);
  return entries;
}

/**
 * Get pending delivery count.
 */
export function getPendingDeliveryCount(): number {
  return readStore().filter((e) => e.status === "pending").length;
}
