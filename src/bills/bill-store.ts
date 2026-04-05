/**
 * Bill Store — tracks invoices and bills (specific payments).
 * Persists to workspace/state/bills.json.
 * Pattern: identical to src/contracts/contract-store.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type { Bill, BillCategory, BillStatus } from "./bill-types";

function getPath(): string {
  return statePath("bills.json");
}

function ensureDir(): void {
  const dir = dirname(getPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): Bill[] {
  ensureDir();
  const p = getPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: Bill[]): void {
  ensureDir();
  writeFileSync(getPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `bill-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

/** Normalize vendor names to prevent duplicates from AI variations */
const VENDOR_ALIASES: Record<string, string> = {
  "בזק ג'ן": "בזק-ג'ן",
  "בזק-ג'ן (חשמל)": "בזק-ג'ן",
  "בזק ג'ן (חשמל)": "בזק-ג'ן",
  "bezeq hashmal": "בזק-ג'ן",
  "חברת החשמל": "בזק-ג'ן",
  "הוט": "HOT",
  "hot": "HOT",
  "הוט מובייל": "HOT Mobile",
  "פרטנר": "Partner",
  "partner": "Partner",
  "סלקום": "Cellcom",
  "cellcom": "Cellcom",
  "בזק": "בזק",
  "פלאפון": "פלאפון",
  "גולן טלקום": "גולן טלקום",
  "yes": "YES",
  "נטפליקס": "Netflix",
  "netflix": "Netflix",
  "ספוטיפיי": "Spotify",
  "spotify": "Spotify",
};

/** Category overrides for known vendors */
const VENDOR_CATEGORY_OVERRIDES: Record<string, BillCategory> = {
  "HOT": "tv",
  "HOT Mobile": "phone",
  "Partner": "phone",
  "Cellcom": "phone",
  "בזק": "internet",
  "פלאפון": "phone",
  "גולן טלקום": "phone",
  "YES": "tv",
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

function overrideCategory(vendor: string, category: BillCategory): BillCategory {
  return VENDOR_CATEGORY_OVERRIDES[vendor] || category;
}

/** Compute status based on due date and paid state */
function computeStatus(bill: Pick<Bill, "status" | "dueDate" | "paidAt">): BillStatus {
  if (bill.paidAt || bill.status === "paid") return "paid";
  if (bill.dueDate) {
    const daysUntil = Math.ceil(
      (new Date(bill.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    if (daysUntil < 0) return "overdue";
  }
  return "unpaid";
}

/**
 * Add a new bill. Deduplicates by:
 * - vendor + invoiceNumber (exact match)
 * - vendor + periodEnd within 7 days (fuzzy match)
 */
export function addBill(data: Omit<Bill, "id" | "createdAt">): Bill | null {
  const entries = readStore();

  // Normalize vendor name and category
  data.vendor = normalizeVendor(data.vendor);
  data.category = overrideCategory(data.vendor, data.category);

  const vendorLower = data.vendor.toLowerCase();

  // Dedup by invoice number
  if (data.invoiceNumber) {
    const existing = entries.find(
      (b) =>
        b.vendor.toLowerCase() === vendorLower &&
        b.invoiceNumber === data.invoiceNumber
    );
    if (existing) {
      console.log(`[bills] Duplicate: ${data.vendor} invoice ${data.invoiceNumber}`);
      return null;
    }
  }

  // Dedup by vendor + period (within 7 days)
  if (data.periodEnd) {
    const periodTs = new Date(data.periodEnd).getTime();
    const WINDOW = 7 * 24 * 60 * 60 * 1000;
    const existing = entries.find(
      (b) =>
        b.vendor.toLowerCase() === vendorLower &&
        b.category === data.category &&
        b.periodEnd &&
        Math.abs(new Date(b.periodEnd).getTime() - periodTs) < WINDOW
    );
    if (existing) {
      console.log(`[bills] Duplicate: ${data.vendor} period ${data.periodEnd}`);
      return null;
    }
  }

  const entry: Bill = {
    ...data,
    id: generateId(),
    status: computeStatus(data),
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);
  writeStore(entries);
  return entry;
}

/** Get bills, optionally filtered */
export function getBills(filter?: {
  category?: BillCategory;
  status?: BillStatus;
  vendor?: string;
}): Bill[] {
  let entries = readStore();

  // Refresh statuses
  let updated = false;
  for (const b of entries) {
    const newStatus = computeStatus(b);
    if (newStatus !== b.status) {
      b.status = newStatus;
      updated = true;
    }
  }
  if (updated) writeStore(entries);

  if (filter?.category) entries = entries.filter((b) => b.category === filter.category);
  if (filter?.status) entries = entries.filter((b) => b.status === filter.status);
  if (filter?.vendor) {
    const v = filter.vendor.toLowerCase();
    entries = entries.filter((b) => b.vendor.toLowerCase().includes(v));
  }
  return entries;
}

/** Mark a bill as paid */
export function markPaid(id: string): Bill | null {
  const entries = readStore();
  const entry = entries.find((b) => b.id === id);
  if (!entry) return null;
  entry.status = "paid";
  entry.paidAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}

/** Get all unpaid bills */
export function getUnpaidBills(): Bill[] {
  return getBills().filter((b) => b.status === "unpaid" || b.status === "overdue");
}

/** Get overdue bills */
export function getOverdueBills(): Bill[] {
  return getBills({ status: "overdue" });
}

/** Find bill by vendor name (fuzzy) for mark-paid convenience */
export function findBillByVendor(vendor: string): Bill | null {
  const lower = vendor.toLowerCase();
  return (
    readStore()
      .filter((b) => b.status !== "paid")
      .find((b) => b.vendor.toLowerCase().includes(lower)) || null
  );
}
