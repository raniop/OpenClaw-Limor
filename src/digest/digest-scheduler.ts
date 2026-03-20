/**
 * Digest scheduler — sends daily digest at 08:00 Israel time,
 * and generates daily conversation summaries at 23:00 Israel time.
 */
import { schedule, ScheduledTask } from "node-cron";
import { generateDailyDigest } from "./digest-service";
import { generateDailySummaries } from "./daily-summaries";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import { logAudit } from "../audit/audit-log";

let digestTask: ScheduledTask | null = null;
let summariesTask: ScheduledTask | null = null;

/**
 * Start the daily digest scheduler.
 * Runs every day at 08:00 Israel time.
 * Also starts the daily summaries generator at 23:00 Israel time.
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

  // Run at 23:00 every day, Israel timezone — generate conversation summaries
  summariesTask = schedule("0 23 * * *", async () => {
    console.log("[daily-summaries] Running daily conversation summaries...");
    try {
      const summaries = await generateDailySummaries();
      logAudit("system", "daily_summaries_generated", "conversations", `success: ${summaries.length} summaries`);
      console.log(`[daily-summaries] Generated ${summaries.length} conversation summaries`);
    } catch (error: any) {
      console.error("[daily-summaries] Failed to generate summaries:", error.message);
      logAudit("system", "daily_summaries_generated", "conversations", `error: ${error.message}`);
    }
  }, {
    timezone: "Asia/Jerusalem",
  });

  console.log("[digest] Scheduler started — daily digest at 08:00, summaries at 23:00 Israel time");
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (digestTask) {
    digestTask.stop();
    digestTask = null;
  }
  if (summariesTask) {
    summariesTask.stop();
    summariesTask = null;
  }
  console.log("[digest] Scheduler stopped");
}
