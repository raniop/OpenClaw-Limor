/**
 * Digest scheduler — sends daily digest at 08:00 Israel time.
 */
import { schedule, ScheduledTask } from "node-cron";
import { generateDailyDigest } from "./digest-service";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import { logAudit } from "../audit/audit-log";

let scheduledTask: ScheduledTask | null = null;

/**
 * Start the daily digest scheduler.
 * Runs every day at 08:00 Israel time.
 */
export function startDigestScheduler(): void {
  if (scheduledTask) {
    console.log("[digest] Scheduler already running");
    return;
  }

  // Run at 08:00 every day, Israel timezone
  scheduledTask = schedule("0 8 * * *", async () => {
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

  console.log("[digest] Scheduler started — daily digest at 08:00 Israel time");
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[digest] Scheduler stopped");
  }
}
