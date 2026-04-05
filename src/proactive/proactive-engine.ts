/**
 * Proactive Engine — generates context-aware proactive messages.
 * Checks various triggers and produces natural Hebrew messages.
 */
import { getDueFollowups } from "../followups";
import { listEvents } from "../calendar";
import { config } from "../config";

export interface ProactiveMessage {
  type: "followup_reminder" | "pre_meeting" | "morning_summary" | "contract_renewal" | "bill_overdue";
  text: string;
  priority: "low" | "medium" | "high";
}

// Track which followup IDs were already reminded — persisted to disk
import { existsSync, readFileSync, writeFileSync } from "fs";
import { statePath } from "../state-dir";

const REMINDED_PATH = statePath("reminded-followups.json");

function loadRemindedIds(): Set<string> {
  try {
    if (existsSync(REMINDED_PATH)) {
      return new Set(JSON.parse(readFileSync(REMINDED_PATH, "utf-8")));
    }
  } catch {}
  return new Set();
}

function saveRemindedId(id: string): void {
  const ids = loadRemindedIds();
  ids.add(id);
  // Keep last 100 only
  const arr = [...ids].slice(-100);
  writeFileSync(REMINDED_PATH, JSON.stringify(arr), "utf-8");
}

// Junk followup reasons that should never be reminded
const JUNK_REASONS = ["עדכון", "מעקב", "follow up", "לחזור למשתמש אם לא שלח את הפרט החסר"];

/**
 * Check for overdue followups and return a reminder message if found.
 * Each followup is only reminded ONCE (persisted across restarts).
 * Junk followups are skipped entirely.
 */
export function checkOverdueFollowups(): ProactiveMessage | null {
  const overdue = getDueFollowups();
  if (overdue.length === 0) return null;

  const remindedIds = loadRemindedIds();

  // Find first overdue that hasn't been reminded and isn't junk
  const unreminded = overdue.find(fu => {
    if (remindedIds.has(fu.id)) return false;
    const reason = fu.reason.trim().toLowerCase();
    if (JUNK_REASONS.some(j => reason === j.toLowerCase() || reason.includes(j.toLowerCase()))) return false;
    return true;
  });

  if (!unreminded) return null;

  saveRemindedId(unreminded.id);
  const reason = unreminded.reason.substring(0, 80);
  const name = unreminded.contactName || "מישהו";

  return {
    type: "followup_reminder",
    text: `היי ${config.ownerName} 👋\nיש משהו שעבר הזמן שלו: "${reason}" (${name}).\nרוצה שאטפל בזה?`,
    priority: "high",
  };
}

/**
 * Check for upcoming calendar events and return a reminder.
 */
export async function checkUpcomingEvents(): Promise<ProactiveMessage | null> {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

    const eventsText = await listEvents(now);
    if (eventsText.includes("אין אירועים")) return null;

    // Parse events to find ones starting within 30 minutes
    const lines = eventsText.split("\n");
    for (const line of lines) {
      // Match time patterns like "14:00 - 15:00: Meeting Name"
      const timeMatch = line.match(/^(\d{1,2}):(\d{2})/);
      if (!timeMatch) continue;

      const eventHour = parseInt(timeMatch[1]);
      const eventMin = parseInt(timeMatch[2]);
      const nowHour = parseInt(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }));
      const nowMin = now.getMinutes();

      const eventMinTotal = eventHour * 60 + eventMin;
      const nowMinTotal = nowHour * 60 + nowMin;
      const diff = eventMinTotal - nowMinTotal;

      if (diff > 0 && diff <= 35) {
        const eventName = line.replace(/^\d{1,2}:\d{2}[^:]*:\s*/, "").trim();
        return {
          type: "pre_meeting",
          text: `⏰ ${config.ownerName}, יש לך "${eventName}" בעוד ${diff} דקות!`,
          priority: "medium",
        };
      }
    }

    return null;
  } catch (err) {
    console.error("[proactive] Calendar check failed:", err);
    return null;
  }
}

/**
 * Generate a morning summary with today's schedule overview.
 */
export async function generateMorningSummary(): Promise<ProactiveMessage | null> {
  try {
    const today = new Date();
    const eventsText = await listEvents(today);

    const overdue = getDueFollowups();
    const parts: string[] = [`בוקר טוב ${config.ownerName}! ☀️\n`];

    if (!eventsText.includes("אין אירועים")) {
      parts.push("📅 *היום ביומן:*");
      parts.push(eventsText);
    } else {
      parts.push("📅 היומן פנוי היום!");
    }

    if (overdue.length > 0) {
      parts.push("");
      parts.push(`⚠️ יש ${overdue.length} דבר/ים שעבר הזמן שלהם — תגיד אם לטפל.`);
    }

    return {
      type: "morning_summary",
      text: parts.join("\n"),
      priority: "low",
    };
  } catch (err) {
    console.error("[proactive] Morning summary failed:", err);
    return null;
  }
}

// ─── Contract Renewal Check ──────────────────────────────────────────

import { getExpiringContracts } from "../contracts/contract-store";
import { CATEGORY_LABELS, CATEGORY_EMOJIS } from "../contracts/contract-types";
import { getOverdueBills, getUnpaidBills } from "../bills/bill-store";
import { BILL_CATEGORY_EMOJIS } from "../bills/bill-types";

const REMINDED_CONTRACTS_PATH = statePath("reminded-contracts.json");

function loadRemindedContractIds(): Set<string> {
  try {
    if (existsSync(REMINDED_CONTRACTS_PATH)) {
      return new Set(JSON.parse(readFileSync(REMINDED_CONTRACTS_PATH, "utf-8")));
    }
  } catch {}
  return new Set();
}

function saveRemindedContractId(id: string): void {
  const ids = loadRemindedContractIds();
  ids.add(id);
  const arr = [...ids].slice(-100);
  writeFileSync(REMINDED_CONTRACTS_PATH, JSON.stringify(arr), "utf-8");
}

/**
 * Check for contracts expiring within 30 days.
 * Each contract is only reminded ONCE.
 */
export function checkExpiringContracts(): ProactiveMessage | null {
  const expiring = getExpiringContracts(30);
  if (expiring.length === 0) return null;

  const remindedIds = loadRemindedContractIds();
  const unreminded = expiring.find((c) => !remindedIds.has(c.id));
  if (!unreminded) return null;

  saveRemindedContractId(unreminded.id);

  const targetDate = unreminded.endDate || unreminded.renewalDate;
  const daysLeft = targetDate
    ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : "?";

  const emoji = CATEGORY_EMOJIS[unreminded.category] || "📋";
  const cat = CATEGORY_LABELS[unreminded.category] || unreminded.category;
  const amount = unreminded.amount ? ` (${unreminded.amount} ${unreminded.currency})` : "";

  return {
    type: "contract_renewal",
    text: `${emoji} היי ${config.ownerName}, החוזה עם **${unreminded.vendor}** (${cat})${amount} מתחדש בעוד ${daysLeft} ימים.\nרוצה שאבדוק אם כדאי לחדש או לשנות?`,
    priority: "medium",
  };
}

// ─── Overdue Bills Check ─────────────────────────────────────────────

const REMINDED_BILLS_PATH = statePath("reminded-bills.json");

function loadRemindedBillIds(): Set<string> {
  try {
    if (existsSync(REMINDED_BILLS_PATH)) {
      return new Set(JSON.parse(readFileSync(REMINDED_BILLS_PATH, "utf-8")));
    }
  } catch {}
  return new Set();
}

function saveRemindedBillId(id: string): void {
  const ids = loadRemindedBillIds();
  ids.add(id);
  const arr = [...ids].slice(-200);
  writeFileSync(REMINDED_BILLS_PATH, JSON.stringify(arr), "utf-8");
}

/**
 * Check for overdue or soon-due bills.
 * Each bill is only reminded ONCE.
 */
export function checkOverdueBills(): ProactiveMessage | null {
  // Check overdue first
  const overdue = getOverdueBills();
  const remindedIds = loadRemindedBillIds();

  const overdueUnreminded = overdue.find((b) => !remindedIds.has(b.id));
  if (overdueUnreminded) {
    saveRemindedBillId(overdueUnreminded.id);
    const emoji = BILL_CATEGORY_EMOJIS[overdueUnreminded.category] || "📄";
    return {
      type: "bill_overdue",
      text: `🔴 ${emoji} ${config.ownerName}, יש חשבון **${overdueUnreminded.vendor}** של ${overdueUnreminded.amount} ${overdueUnreminded.currency} שעבר את מועד התשלום${overdueUnreminded.dueDate ? ` (${new Date(overdueUnreminded.dueDate).toLocaleDateString("he-IL")})` : ""}!\nרוצה שאסמן כשולם?`,
      priority: "high",
    };
  }

  // Then check bills due within 3 days
  const unpaid = getUnpaidBills().filter((b) => {
    if (!b.dueDate || remindedIds.has(b.id)) return false;
    const daysUntil = Math.ceil(
      (new Date(b.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    return daysUntil >= 0 && daysUntil <= 3;
  });

  if (unpaid.length > 0) {
    const bill = unpaid[0];
    saveRemindedBillId(bill.id);
    const daysLeft = Math.ceil(
      (new Date(bill.dueDate!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    const emoji = BILL_CATEGORY_EMOJIS[bill.category] || "📄";
    const urgency = daysLeft === 0 ? "היום" : `בעוד ${daysLeft} ימים`;
    return {
      type: "bill_overdue",
      text: `⚠️ ${emoji} ${config.ownerName}, חשבון **${bill.vendor}** של ${bill.amount} ${bill.currency} לתשלום ${urgency}!`,
      priority: "high",
    };
  }

  return null;
}
