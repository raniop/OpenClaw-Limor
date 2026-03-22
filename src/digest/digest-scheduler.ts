/**
 * Digest scheduler — sends daily digest at 08:00 Israel time,
 * and generates executive briefings twice daily (14:00 + 23:00).
 * Evening briefing includes tomorrow's calendar.
 */
import { schedule, ScheduledTask } from "node-cron";
import { generateDailyDigest } from "./digest-service";
import { generateDailySummaries, DailySummary } from "./daily-summaries";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import { logAudit } from "../audit/audit-log";
import { listEvents } from "../calendar";
import { rotateConversations } from "../conversation";

let digestTask: ScheduledTask | null = null;
let summariesTask1: ScheduledTask | null = null;
let summariesTask2: ScheduledTask | null = null;

// Dedup guards — prevent double-fires within 60 seconds
let lastDigestTime = 0;
let lastSummary1Time = 0;
let lastSummary2Time = 0;

function formatBriefingMessage(
  label: string,
  summaries: DailySummary[],
  calendarSection?: string,
): string {
  // Merge all items across conversations
  const allUrgent: string[] = [];
  const allOpen: string[] = [];
  const allDone: string[] = [];
  const allFailed: string[] = [];

  for (const s of summaries) {
    allUrgent.push(...s.urgent);
    allOpen.push(...s.open);
    allDone.push(...s.done);
    allFailed.push(...s.failed);
  }

  const lines: string[] = [];
  lines.push(`📊 *בריפינג ${label}*\n`);

  if (allUrgent.length > 0) {
    lines.push("🔴 *דחוף — צריך תשומת לב:*");
    for (const item of allUrgent) lines.push(`• ${item}`);
    lines.push("");
  }

  if (allOpen.length > 0) {
    lines.push("🟡 *פתוח — לא סגור:*");
    for (const item of allOpen) lines.push(`• ${item}`);
    lines.push("");
  }

  if (allDone.length > 0) {
    lines.push("✅ *טופל היום:*");
    for (const item of allDone) lines.push(`• ${item}`);
    lines.push("");
  }

  if (allFailed.length > 0) {
    lines.push("⚠️ *כשלים:*");
    for (const item of allFailed) lines.push(`• ${item}`);
    lines.push("");
  }

  if (calendarSection) {
    lines.push(`📅 *מחר:*`);
    lines.push(calendarSection);
    lines.push("");
  }

  // If nothing at all
  if (
    allUrgent.length === 0 &&
    allOpen.length === 0 &&
    allDone.length === 0 &&
    allFailed.length === 0 &&
    !calendarSection
  ) {
    lines.push("אין פעילות מיוחדת לדווח.");
  }

  lines.push(
    `\nסה"כ: ${summaries.length} שיחות פעילות`,
  );

  return lines.join("\n");
}

async function getTomorrowCalendar(): Promise<string | undefined> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const events = await listEvents(tomorrow);
    if (events && !events.includes("אין אירועים")) {
      return events;
    }
    return "אין אירועים ביומן";
  } catch (err) {
    console.error("[daily-summaries] Failed to fetch tomorrow calendar:", err);
    return undefined;
  }
}

async function runAndSendSummaries(
  label: string,
  includeCalendar: boolean,
): Promise<void> {
  console.log(
    `[daily-summaries] Running ${label} executive briefing...`,
  );
  try {
    const summaries = await generateDailySummaries();
    logAudit(
      "system",
      "daily_summaries_generated",
      "conversations",
      `success: ${summaries.length} summaries`,
    );
    console.log(
      `[daily-summaries] Generated ${summaries.length} briefings`,
    );

    // Send briefing to owner via WhatsApp
    if (summaries.length > 0) {
      const notify = getNotifyOwnerCallback();
      if (notify) {
        const calendarSection = includeCalendar
          ? await getTomorrowCalendar()
          : undefined;

        const message = formatBriefingMessage(
          label,
          summaries,
          calendarSection,
        );
        await notify(message);
        console.log(`[daily-summaries] Sent ${label} briefing to owner`);
      }
    }
  } catch (error: any) {
    console.error(
      "[daily-summaries] Failed to generate briefing:",
      error.message,
    );
    logAudit(
      "system",
      "daily_summaries_generated",
      "conversations",
      `error: ${error.message}`,
    );
  }
}

/**
 * Start the daily digest scheduler.
 * - 08:00: Daily digest (status, followups, calendar)
 * - 14:00: Midday executive briefing
 * - 23:00: Evening executive briefing + tomorrow's calendar
 */
export function startDigestScheduler(): void {
  if (digestTask) {
    console.log("[digest] Scheduler already running");
    return;
  }

  // Run at 08:00 every day, Israel timezone
  digestTask = schedule(
    "0 8 * * *",
    async () => {
      const now = Date.now();
      if (now - lastDigestTime < 60000) {
        console.log("[digest] Skipping duplicate fire");
        return;
      }
      lastDigestTime = now;

      // Rotate conversations daily
      try {
        rotateConversations();
      } catch (err: any) {
        console.error("[digest] Conversation rotation failed:", err.message);
      }

      console.log("[digest] Running daily digest...");
      try {
        const digest = await generateDailyDigest();
        const notify = getNotifyOwnerCallback();
        if (notify) {
          await notify(digest);
          logAudit("system", "daily_digest_sent", "owner", "success");
          console.log("[digest] Daily digest sent to owner");
        } else {
          console.warn(
            "[digest] No notify callback available — skipping",
          );
        }
      } catch (error: any) {
        console.error(
          "[digest] Failed to send digest:",
          error.message,
        );
        logAudit(
          "system",
          "daily_digest_sent",
          "owner",
          `error: ${error.message}`,
        );
      }
    },
    {
      timezone: "Asia/Jerusalem",
    },
  );

  // Midday briefing at 14:00 (no calendar)
  summariesTask1 = schedule(
    "0 14 * * *",
    () => {
      const now = Date.now();
      if (now - lastSummary1Time < 60000) {
        console.log("[daily-summaries] Skipping duplicate midday fire");
        return;
      }
      lastSummary1Time = now;
      runAndSendSummaries("צהריים", false);
    },
    {
      timezone: "Asia/Jerusalem",
    },
  );

  // Evening briefing at 23:00 (with tomorrow's calendar)
  summariesTask2 = schedule(
    "0 23 * * *",
    () => {
      const now = Date.now();
      if (now - lastSummary2Time < 60000) {
        console.log("[daily-summaries] Skipping duplicate evening fire");
        return;
      }
      lastSummary2Time = now;
      runAndSendSummaries("ערב", true);
    },
    {
      timezone: "Asia/Jerusalem",
    },
  );

  console.log(
    "[digest] Scheduler started — digest 08:00, briefings 14:00 + 23:00 Israel time",
  );
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (digestTask) {
    digestTask.stop();
    digestTask = null;
  }
  if (summariesTask1) {
    summariesTask1.stop();
    summariesTask1 = null;
  }
  if (summariesTask2) {
    summariesTask2.stop();
    summariesTask2 = null;
  }
  console.log("[digest] Scheduler stopped");
}
