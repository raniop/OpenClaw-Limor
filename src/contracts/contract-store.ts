/**
 * Contract Store — tracks recurring subscriptions and contracts.
 * Persists to workspace/state/contracts.json.
 * Follows the same pattern as src/email/email-order-store.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type {
  Contract,
  ContractCategory,
  ContractStatus,
  ContractBillingCycle,
} from "./contract-types";

function getPath(): string {
  return statePath("contracts.json");
}

function ensureDir(): void {
  const dir = dirname(getPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): Contract[] {
  ensureDir();
  const p = getPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: Contract[]): void {
  ensureDir();
  writeFileSync(getPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `cont-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Add or update a contract. Deduplicates by vendor+category:
 * - If same vendor+category exists → update it (new email data)
 * - Otherwise → create new entry
 */
/** Normalize vendor names to prevent duplicates from AI variations */
const VENDOR_ALIASES: Record<string, string> = {
  "בזק ג'ן": "בזק-ג'ן",
  "בזק-ג'ן (חשמל)": "בזק-ג'ן",
  "חברת החשמל": "בזק-ג'ן",
  "הוט": "HOT",
  "hot": "HOT",
  "פרטנר": "Partner",
  "סלקום": "Cellcom",
  "נטפליקס": "Netflix",
  "ספוטיפיי": "Spotify",
};

function normalizeVendor(vendor: string): string {
  const lower = vendor.toLowerCase().trim();
  for (const [alias, normalized] of Object.entries(VENDOR_ALIASES)) {
    if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase())) {
      return normalized;
    }
  }
  return vendor.trim();
}

export function addContract(
  data: Omit<Contract, "id" | "createdAt">
): Contract | null {
  const entries = readStore();

  // Normalize vendor name
  data.vendor = normalizeVendor(data.vendor);

  // Check for existing contract with same vendor + category
  const vendorLower = data.vendor.toLowerCase();
  const existing = entries.find(
    (c) =>
      c.vendor.toLowerCase() === vendorLower &&
      c.category === data.category &&
      c.status !== "cancelled"
  );

  if (existing) {
    // Update existing contract with new data
    if (data.amount !== undefined) existing.amount = data.amount;
    if (data.renewalDate) existing.renewalDate = data.renewalDate;
    if (data.endDate) existing.endDate = data.endDate;
    if (data.lastEmailId) existing.lastEmailId = data.lastEmailId;
    if (data.lastEmailDate) existing.lastEmailDate = data.lastEmailDate;
    if (data.summary) existing.summary = data.summary;
    if (data.terms) existing.terms = data.terms;
    existing.updatedAt = new Date().toISOString();

    // Refresh status based on dates
    existing.status = computeStatus(existing);

    writeStore(entries);
    console.log(`[contracts] Updated: ${existing.vendor} (${existing.category})`);
    return existing;
  }

  // Create new entry
  const entry: Contract = {
    ...data,
    id: generateId(),
    status: computeStatus(data),
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);
  writeStore(entries);
  return entry;
}

/**
 * Compute status based on dates.
 */
function computeStatus(
  c: Pick<Contract, "endDate" | "renewalDate" | "status">
): ContractStatus {
  if (c.status === "cancelled") return "cancelled";

  const targetDate = c.endDate || c.renewalDate;
  if (!targetDate) return "active";

  const daysUntil = Math.ceil(
    (new Date(targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  if (daysUntil < 0) return "expired";
  if (daysUntil <= 30) return "expiring_soon";
  return "active";
}

/**
 * Get contracts, optionally filtered.
 */
export function getContracts(filter?: {
  category?: ContractCategory;
  status?: ContractStatus;
}): Contract[] {
  let entries = readStore();

  // Refresh statuses
  let updated = false;
  for (const c of entries) {
    const newStatus = computeStatus(c);
    if (newStatus !== c.status) {
      c.status = newStatus;
      updated = true;
    }
  }
  if (updated) writeStore(entries);

  if (filter?.category) entries = entries.filter((c) => c.category === filter.category);
  if (filter?.status) entries = entries.filter((c) => c.status === filter.status);
  return entries;
}

/**
 * Update a contract by ID.
 */
export function updateContract(
  id: string,
  updates: Partial<
    Pick<
      Contract,
      | "vendor"
      | "category"
      | "amount"
      | "currency"
      | "billingCycle"
      | "startDate"
      | "endDate"
      | "renewalDate"
      | "autoRenew"
      | "status"
      | "notes"
      | "summary"
      | "terms"
    >
  >
): Contract | null {
  const entries = readStore();
  const entry = entries.find((c) => c.id === id);
  if (!entry) return null;

  Object.assign(entry, updates);
  entry.status = computeStatus(entry);
  entry.updatedAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}

/**
 * Get contracts expiring within N days.
 */
export function getExpiringContracts(withinDays: number = 30): Contract[] {
  const entries = getContracts(); // refreshes statuses
  const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;

  return entries.filter((c) => {
    if (c.status === "cancelled") return false;
    const targetDate = c.endDate || c.renewalDate;
    if (!targetDate) return false;
    const ts = new Date(targetDate).getTime();
    return ts > Date.now() && ts <= cutoff;
  });
}

/**
 * Find contract by vendor name (fuzzy).
 */
export function findContractByVendor(vendor: string): Contract | null {
  const lower = vendor.toLowerCase();
  return (
    readStore().find(
      (c) =>
        c.status !== "cancelled" &&
        c.vendor.toLowerCase().includes(lower)
    ) || null
  );
}
