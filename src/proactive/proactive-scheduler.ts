/**
 * Proactive Scheduler — runs periodic checks and sends proactive messages.
 * Uses node-cron for scheduling, coordinates with rate limiter.
 */
import { schedule, ScheduledTask } from "node-cron";
import { checkOverdueFollowups, checkUpcomingEvents, generateMorningSummary } from "./proactive-engine";
import { canSendProactive, recordProactiveSent } from "./rate-limiter";
import { getNotifyOwnerCallback } from "../ai/callbacks";

const tasks: ScheduledTask[] = [];

async function trySendProactive(
  generator: () => ProactiveResult | Promise<ProactiveResult>,
  source: string
): Promise<void> {
  const check = canSendProactive();
  if (!check.allowed) {
    console.log(`[proactive:${source}] Blocked: ${check.reason}`);
    return;
  }

  try {
    const message = await generator();
    if (!message) return;

    const notify = getNotifyOwnerCallback();
    if (!notify) {
      console.log(`[proactive:${source}] No notify callback`);
      return;
    }

    await notify(message.text);
    recordProactiveSent();
    console.log(`[proactive:${source}] Sent: ${message.type}`);
  } catch (err) {
    console.error(`[proactive:${source}] Error:`, err);
  }
}

type ProactiveResult = Awaited<ReturnType<typeof checkOverdueFollowups>>;

/**
 * Start all proactive schedulers.
 */
export function startProactiveScheduler(): void {
  if (tasks.length > 0) {
    console.log("[proactive] Scheduler already running");
    return;
  }

  const tz = { timezone: "Asia/Jerusalem" as const };

  // Every 15 minutes: check overdue followups
  tasks.push(
    schedule("*/15 * * * *", () => {
      trySendProactive(checkOverdueFollowups, "followup");
    }, tz)
  );

  // Every 30 minutes: check upcoming calendar events
  tasks.push(
    schedule("*/30 * * * *", () => {
      trySendProactive(checkUpcomingEvents, "calendar");
    }, tz)
  );

  // Daily at 07:30: morning summary
  tasks.push(
    schedule("30 7 * * *", () => {
      trySendProactive(generateMorningSummary, "morning");
    }, tz)
  );

  console.log("[proactive] Scheduler started (followups:15m, calendar:30m, morning:07:30)");
}

/**
 * Stop all proactive schedulers.
 */
export function stopProactiveScheduler(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  console.log("[proactive] Scheduler stopped");
}
