/**
 * Email Poller — periodically checks for new emails and detects orders/bookings.
 * Runs every 5 minutes, only processes new messages.
 * Follows the same pattern as src/sms/delivery-poller.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import { shouldForwardEmail } from "../operational-rules";
import {
  connectImap,
  isImapConnected,
  isImapConfigured,
  getLatestUid,
  fetchEmailsSinceUid,
} from "./imap-client";
import { detectEmailOrder } from "./order-detector";
import { addEmailOrder } from "./email-order-store";
import { isLikelyContract, detectContract } from "../contracts/contract-detector";
import { addContract } from "../contracts/contract-store";
import type { EmailPollerState, EmailOrder } from "./email-types";

const STATE_FILE = "email-poller-state.json";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let sendToOwner: ((text: string) => Promise<void>) | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ─── State Persistence ─────────────────────────────────────────────────

function getStatePath(): string {
  return statePath(STATE_FILE);
}

function loadState(): EmailPollerState {
  const p = getStatePath();
  if (!existsSync(p)) {
    return { lastSeenUid: 0, lastPollAt: "", totalProcessed: 0 };
  }
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { lastSeenUid: 0, lastPollAt: "", totalProcessed: 0 };
  }
}

function saveState(state: EmailPollerState): void {
  const p = getStatePath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Notification Formatting ───────────────────────────────────────────

const TYPE_EMOJIS: Record<string, string> = {
  package: "📦",
  flight: "✈️",
  hotel: "🏨",
  receipt: "🧾",
};

function formatOrderNotification(order: EmailOrder): string {
  const emoji = TYPE_EMOJIS[order.type] || "📧";
  const parts = [`${emoji} ${order.summary}`];

  if (order.type === "flight" && order.flightNumber) {
    if (order.route) parts.push(`מסלול: ${order.route}`);
    if (order.departureDate) parts.push(`תאריך: ${order.departureDate}`);
  }

  if (order.type === "hotel") {
    if (order.hotelName) parts.push(`מלון: ${order.hotelName}`);
    if (order.checkInDate && order.checkOutDate) {
      parts.push(`צ'ק-אין: ${order.checkInDate} | צ'ק-אאוט: ${order.checkOutDate}`);
    }
  }

  if (order.trackingNumber) {
    parts.push(`מספר מעקב: ${order.trackingNumber}`);
  }

  return parts.join("\n");
}

// ─── Quiet Hours ───────────────────────────────────────────────────────

function isQuietHours(): boolean {
  const now = new Date();
  // Israel time (UTC+2/+3)
  const israelHour = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  ).getHours();
  return israelHour >= 22 || israelHour < 7;
}

// Queue for messages during quiet hours
let quietQueue: string[] = [];

// ─── Poll Logic ────────────────────────────────────────────────────────

async function pollEmails(): Promise<void> {
  if (!sendToOwner) return;

  try {
    // Each operation opens its own connection now (connect-per-op pattern)
    if (!isImapConfigured()) return;

    const state = loadState();

    // First run: just set baseline, don't process historic emails
    if (state.lastSeenUid === 0) {
      const latestUid = await getLatestUid();
      if (latestUid > 0) {
        state.lastSeenUid = latestUid;
        state.lastPollAt = new Date().toISOString();
        saveState(state);
        console.log(`[email] Poller initialized at UID ${latestUid}`);
      }
      return;
    }

    // Fetch new emails
    const newEmails = await fetchEmailsSinceUid(state.lastSeenUid, 50);
    if (newEmails.length === 0) {
      state.lastPollAt = new Date().toISOString();
      saveState(state);
      return;
    }

    // Update cursor
    const maxUid = Math.max(...newEmails.map((e) => e.uid));
    if (maxUid > state.lastSeenUid) state.lastSeenUid = maxUid;
    state.totalProcessed += newEmails.length;
    state.lastPollAt = new Date().toISOString();
    saveState(state);

    console.log(`[email] Polled ${newEmails.length} new emails`);

    // Detect orders in new emails
    for (const email of newEmails) {
      const orderData = detectEmailOrder(email);
      if (!orderData) continue;

      // Check operational rules before forwarding
      if (!shouldForwardEmail(orderData.vendor || "", orderData.type || "")) {
        console.log(`[email] Blocked by operational rule: ${orderData.vendor}/${orderData.type}`);
        continue;
      }

      const saved = addEmailOrder(orderData);
      if (!saved) continue; // Duplicate

      console.log(`[email] Order detected: ${saved.type} — ${saved.summary}`);

      const notification = formatOrderNotification(saved);

      if (isQuietHours()) {
        quietQueue.push(notification);
        console.log(`[email] Queued notification for after quiet hours`);
      } else {
        try {
          await sendToOwner(notification);
        } catch (err) {
          console.error("[email] Failed to send order notification:", err);
        }
      }
    }

    // Detect contracts/subscriptions in new emails (silent — no notification)
    for (const email of newEmails) {
      if (!isLikelyContract(email)) continue;
      try {
        const contractData = await detectContract(email);
        if (contractData) {
          const saved = addContract(contractData);
          if (saved) {
            console.log(`[email] Contract detected: ${saved.vendor} (${saved.category}) — ${saved.summary}`);
          }
        }
      } catch (err) {
        console.error("[email] Contract detection error:", err);
      }
    }

    // Flush quiet queue if no longer quiet
    if (!isQuietHours() && quietQueue.length > 0) {
      for (const msg of quietQueue) {
        try {
          await sendToOwner(msg);
        } catch (err) {
          console.error("[email] Failed to send queued notification:", err);
        }
      }
      quietQueue = [];
    }
  } catch (err) {
    console.error("[email] Poll error:", err);
  }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Start polling for new emails. Call once at startup.
 */
export async function startEmailPoller(
  notifyOwner: (text: string) => Promise<void>,
  intervalMs: number = DEFAULT_INTERVAL_MS
): Promise<void> {
  if (!isImapConfigured()) {
    console.log("[email] iCloud IMAP not configured, email poller disabled");
    return;
  }

  sendToOwner = notifyOwner;

  // Run first poll (each op connects on its own)
  await pollEmails();

  // Schedule recurring polls
  pollInterval = setInterval(pollEmails, intervalMs);
  console.log(
    `[email] Poller started (checking every ${intervalMs / 1000}s)`
  );
}

/**
 * Stop the email poller.
 */
export function stopEmailPoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  sendToOwner = null;
  console.log("[email] Poller stopped");
}
