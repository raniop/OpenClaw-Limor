/**
 * Proactive Engine — generates context-aware proactive messages.
 * Checks various triggers and produces natural Hebrew messages.
 */
import { getDueFollowups } from "../followups";
import { listEvents } from "../calendar";
import { config } from "../config";

export interface ProactiveMessage {
  type: "followup_reminder" | "pre_meeting" | "morning_summary";
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
    text: `היי רני 👋\nיש משהו שעבר הזמן שלו: "${reason}" (${name}).\nרוצה שאטפל בזה?`,
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
          text: `⏰ רני, יש לך "${eventName}" בעוד ${diff} דקות!`,
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
    const parts: string[] = ["בוקר טוב רני! ☀️\n"];

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
