/**
 * Auto Cleanup Scheduler — nightly maintenance to keep data clean.
 * Runs daily at 03:30 Israel time (after Amit at 03:00).
 *
 * Cleans:
 * - Audit log: keep last 1000 entries
 * - Daily summaries: keep last 30
 * - Digest history: keep last 30
 * - Completed followups older than 30 days
 * - Duplicate/stale memory facts (via existing AI cleanup)
 * - Completed plans older than 30 days
 */
import { schedule, ScheduledTask } from "node-cron";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { statePath } from "../state-dir";
import { getDb } from "../stores/sqlite-init";

let cleanupTask: ScheduledTask | null = null;

function cleanJsonFile(filename: string, maxEntries: number, label: string): number {
  const path = statePath(filename);
  if (!existsSync(path)) return 0;

  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));

    if (Array.isArray(data)) {
      if (data.length <= maxEntries) return 0;
      const removed = data.length - maxEntries;
      writeFileSync(path, JSON.stringify(data.slice(-maxEntries), null, 2), "utf-8");
      console.log(`[cleanup] ${label}: trimmed ${removed} entries (kept ${maxEntries})`);
      return removed;
    }

    // Object with entries/items array
    for (const key of ["entries", "items", "logs"]) {
      if (Array.isArray(data[key]) && data[key].length > maxEntries) {
        const removed = data[key].length - maxEntries;
        data[key] = data[key].slice(-maxEntries);
        writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
        console.log(`[cleanup] ${label}: trimmed ${removed} entries (kept ${maxEntries})`);
        return removed;
      }
    }
  } catch (err: any) {
    console.error(`[cleanup] Failed to clean ${filename}:`, err.message);
  }
  return 0;
}

function cleanFollowups(): number {
  const path = statePath("followups.json");
  if (!existsSync(path)) return 0;

  try {
    const entries = JSON.parse(readFileSync(path, "utf-8")) as any[];
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const kept = entries.filter(
      (e) => e.status === "pending" || (e.createdAt && e.createdAt >= cutoff)
    );

    if (kept.length < entries.length) {
      const removed = entries.length - kept.length;
      writeFileSync(path, JSON.stringify(kept, null, 2), "utf-8");
      console.log(`[cleanup] followups: removed ${removed} old completed entries`);
      return removed;
    }
  } catch (err: any) {
    console.error("[cleanup] Failed to clean followups:", err.message);
  }
  return 0;
}

function cleanCompletedPlans(): number {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(
      "DELETE FROM plans WHERE status IN ('completed', 'cancelled') AND updated_at < ?"
    ).run(cutoff);
    if (result.changes > 0) {
      console.log(`[cleanup] plans: removed ${result.changes} old completed/cancelled plans`);
    }
    return result.changes;
  } catch (err: any) {
    console.error("[cleanup] Failed to clean plans:", err.message);
    return 0;
  }
}

/**
 * Run all cleanup tasks.
 */
export async function runCleanup(): Promise<string> {
  console.log("[cleanup] Starting nightly cleanup...");

  let totalRemoved = 0;
  const results: string[] = [];

  // 1. Audit log — keep last 1000
  const auditRemoved = cleanJsonFile("audit-log.json", 1000, "audit-log");
  if (auditRemoved > 0) results.push(`audit-log: -${auditRemoved}`);
  totalRemoved += auditRemoved;

  // 2. Daily summaries — keep last 30
  const summariesRemoved = cleanJsonFile("daily-summaries.json", 30, "daily-summaries");
  if (summariesRemoved > 0) results.push(`summaries: -${summariesRemoved}`);
  totalRemoved += summariesRemoved;

  // 3. Digest history — keep last 30
  const digestRemoved = cleanJsonFile("digest-history.json", 30, "digest-history");
  if (digestRemoved > 0) results.push(`digest: -${digestRemoved}`);
  totalRemoved += digestRemoved;

  // 4. Completed followups older than 30 days
  const followupRemoved = cleanFollowups();
  if (followupRemoved > 0) results.push(`followups: -${followupRemoved}`);
  totalRemoved += followupRemoved;

  // 5. Completed/cancelled plans older than 30 days
  const plansRemoved = cleanCompletedPlans();
  if (plansRemoved > 0) results.push(`plans: -${plansRemoved}`);
  totalRemoved += plansRemoved;

  // 6. Failure log — already has MAX_ENTRIES=200 ring buffer, no action needed

  const summary = totalRemoved > 0
    ? `🧹 ניקוי: ${totalRemoved} רשומות הוסרו (${results.join(", ")})`
    : "🧹 ניקוי: הכל נקי, לא נדרשה פעולה";

  console.log(`[cleanup] Done. ${summary}`);
  return summary;
}

/**
 * Start the cleanup scheduler.
 * Runs daily at 03:30 Israel time.
 */
export function startCleanupScheduler(): void {
  if (cleanupTask) {
    console.log("[cleanup] Scheduler already running");
    return;
  }

  const tz = { timezone: "Asia/Jerusalem" as const };

  cleanupTask = schedule("30 3 * * *", () => {
    runCleanup().catch((err) =>
      console.error("[cleanup] Unhandled error in scheduled run:", err)
    );
  }, tz);

  console.log("[cleanup] 🧹 Scheduler started (daily at 03:30 Israel time)");
}

/**
 * Stop the cleanup scheduler.
 */
export function stopCleanupScheduler(): void {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    console.log("[cleanup] Scheduler stopped");
  }
}
