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
 * DISABLED by Rani's request (2025-03-25) — automatic briefings turned off.
 * The scheduler starts but no tasks are registered.
 */
export function startDigestScheduler(): void {
  console.log("[digest] Scheduler disabled — automatic briefings are OFF (disabled by owner request)");
  // All three scheduled tasks (08:00 digest, 14:00 midday, 23:00 evening) are disabled.
  // To re-enable, restore the schedule() calls for digestTask, summariesTask1, summariesTask2.
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
