/**
 * Email Order Store — tracks detected orders/bookings from email.
 * Persists to workspace/state/email-orders.json.
 * Follows the same pattern as src/sms/delivery-store.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type { EmailOrder, EmailOrderType, EmailOrderStatus } from "./email-types";

function getPath(): string {
  return statePath("email-orders.json");
}

function ensureDir(): void {
  const dir = dirname(getPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): EmailOrder[] {
  ensureDir();
  const p = getPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: EmailOrder[]): void {
  ensureDir();
  writeFileSync(getPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `eord-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Add a new email order. Deduplicates by messageId and orderNumber+vendor.
 */
export function addEmailOrder(
  order: Omit<EmailOrder, "id" | "createdAt">
): EmailOrder | null {
  const entries = readStore();

  // Dedup by messageId
  if (entries.some((e) => e.messageId === order.messageId)) return null;

  // Dedup by orderNumber + vendor (same order confirmation resent)
  if (
    order.orderNumber &&
    entries.some(
      (e) =>
        e.orderNumber === order.orderNumber &&
        e.vendor === order.vendor
    )
  ) {
    return null;
  }

  // Dedup: same vendor within 30-minute window
  const DEDUP_WINDOW_MS = 30 * 60 * 1000;
  const orderTs = new Date(order.emailDate).getTime();
  if (
    orderTs &&
    entries.some((e) => {
      if (e.vendor !== order.vendor || e.type !== order.type) return false;
      const existingTs = new Date(e.emailDate).getTime();
      return existingTs && Math.abs(orderTs - existingTs) < DEDUP_WINDOW_MS;
    })
  ) {
    return null;
  }

  const entry: EmailOrder = {
    ...order,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);
  writeStore(entries);
  return entry;
}

/**
 * Get orders, optionally filtered by type and/or status.
 */
export function getEmailOrders(filter?: {
  type?: EmailOrderType;
  status?: EmailOrderStatus;
  days?: number;
}): EmailOrder[] {
  let entries = readStore();
  if (filter?.type) entries = entries.filter((e) => e.type === filter.type);
  if (filter?.status) entries = entries.filter((e) => e.status === filter.status);
  if (filter?.days) {
    const since = Date.now() - filter.days * 24 * 60 * 60 * 1000;
    entries = entries.filter((e) => new Date(e.emailDate).getTime() >= since);
  }
  return entries;
}

/**
 * Update the status of an order.
 */
export function updateOrderStatus(
  id: string,
  status: EmailOrderStatus
): EmailOrder | null {
  const entries = readStore();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}

/**
 * Get all orders with status "detected" (pending review).
 */
export function getPendingOrders(): EmailOrder[] {
  return readStore().filter((e) => e.status === "detected");
}

/**
 * Find an order by tracking number (for cross-referencing with SMS deliveries).
 */
export function findOrderByTracking(trackingNumber: string): EmailOrder | null {
  const lower = trackingNumber.toLowerCase();
  return (
    readStore().find(
      (e) =>
        e.trackingNumber?.toLowerCase().includes(lower)
    ) || null
  );
}

/**
 * Find an order by vendor name (fuzzy, for cross-referencing with SMS deliveries).
 */
export function findOrderByVendor(
  vendor: string,
  withinDays: number = 30
): EmailOrder | null {
  const lower = vendor.toLowerCase();
  const since = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  return (
    readStore().find(
      (e) =>
        e.type === "package" &&
        e.status === "detected" &&
        e.vendor.toLowerCase().includes(lower) &&
        new Date(e.emailDate).getTime() >= since
    ) || null
  );
}

/**
 * Link an email order to an SMS delivery entry.
 */
export function linkOrderToDelivery(
  orderId: string,
  deliveryId: string
): EmailOrder | null {
  const entries = readStore();
  const entry = entries.find((e) => e.id === orderId);
  if (!entry) return null;
  entry.linkedDeliveryId = deliveryId;
  entry.status = "delivered";
  entry.updatedAt = new Date().toISOString();
  writeStore(entries);
  return entry;
}
