/**
 * Digest scheduler — sends daily digest at 08:00 Israel time,
 * and generates conversation summaries twice daily (14:00 + 23:00).
 * Summaries are sent to owner via WhatsApp when ready.
 */
import { schedule, ScheduledTask } from "node-cron";
import { generateDailyDigest } from "./digest-service";
import { generateDailySummaries } from "./daily-summaries";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import { logAudit } from "../audit/audit-log";

let digestTask: ScheduledTask | null = null;
let summariesTask1: ScheduledTask | null = null;
let summariesTask2: ScheduledTask | null = null;

async function runAndSendSummaries(label: string): Promise<void> {
  console.log(`[daily-summaries] Running ${label} conversation summaries...`);
  try {
    const summaries = await generateDailySummaries();
    logAudit("system", "daily_summaries_generated", "conversations", `success: ${summaries.length} summaries`);
    console.log(`[daily-summaries] Generated ${summaries.length} conversation summaries`);

    // Send summary to owner via WhatsApp
    if (summaries.length > 0) {
      const notify = getNotifyOwnerCallback();
      if (notify) {
        const lines: string[] = [];
        lines.push(`📊 *סיכום שיחות ${label}*\n`);

        const contacts = summaries.filter(s => !s.isGroup);
        const groups = summaries.filter(s => s.isGroup);

        if (contacts.length > 0) {
          lines.push("👤 *אנשי קשר:*");
          for (const s of contacts.slice(0, 5)) {
            const mood = s.mood && s.mood !== "neutral" ? ` (${s.mood})` : "";
            lines.push(`• *${s.contactName}*${mood} — ${s.messageCount} הודעות`);
            if (s.summary) lines.push(`  ${s.summary.substring(0, 120)}`);
            if (s.openItems?.length) lines.push(`  ⚠️ פתוח: ${s.openItems.join(", ")}`);
          }
        }

        if (groups.length > 0) {
          lines.push("\n👥 *קבוצות:*");
          for (const s of groups.slice(0, 3)) {
            lines.push(`• *${s.contactName}* — ${s.messageCount} הודעות`);
            if (s.summary) lines.push(`  ${s.summary.substring(0, 120)}`);
          }
        }

        lines.push(`\nסה"כ: ${summaries.length} שיחות`);

        await notify(lines.join("\n"));
        console.log(`[daily-summaries] Sent ${label} summary to owner`);
      }
    }
  } catch (error: any) {
    console.error("[daily-summaries] Failed to generate summaries:", error.message);
    logAudit("system", "daily_summaries_generated", "conversations", `error: ${error.message}`);
  }
}

/**
 * Start the daily digest scheduler.
 * - 08:00: Daily digest (status, followups, calendar)
 * - 14:00: Midday conversation summaries
 * - 23:00: Evening conversation summaries
 */
export function startDigestScheduler(): void {
  if (digestTask) {
    console.log("[digest] Scheduler already running");
    return;
  }

  // Run at 08:00 every day, Israel timezone
  digestTask = schedule("0 8 * * *", async () => {
    console.log("[digest] Running daily digest...");
    try {
      const digest = await generateDailyDigest();
      const notify = getNotifyOwnerCallback();
      if (notify) {
        await notify(digest);
        logAudit("system", "daily_digest_sent", "owner", "success");
        console.log("[digest] Daily digest sent to owner");
      } else {
        console.warn("[digest] No notify callback available — skipping");
      }
    } catch (error: any) {
      console.error("[digest] Failed to send digest:", error.message);
      logAudit("system", "daily_digest_sent", "owner", `error: ${error.message}`);
    }
  }, {
    timezone: "Asia/Jerusalem",
  });

  // Midday summaries at 14:00
  summariesTask1 = schedule("0 14 * * *", () => {
    runAndSendSummaries("צהריים");
  }, {
    timezone: "Asia/Jerusalem",
  });

  // Evening summaries at 23:00
  summariesTask2 = schedule("0 23 * * *", () => {
    runAndSendSummaries("ערב");
  }, {
    timezone: "Asia/Jerusalem",
  });

  console.log("[digest] Scheduler started — digest 08:00, summaries 14:00 + 23:00 Israel time");
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (digestTask) { digestTask.stop(); digestTask = null; }
  if (summariesTask1) { summariesTask1.stop(); summariesTask1 = null; }
  if (summariesTask2) { summariesTask2.stop(); summariesTask2 = null; }
  console.log("[digest] Scheduler stopped");
}
