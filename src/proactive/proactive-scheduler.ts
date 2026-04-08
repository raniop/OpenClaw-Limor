/**
 * Proactive Scheduler — runs periodic checks and sends proactive messages.
 * Uses node-cron for scheduling, coordinates with rate limiter.
 */
import { schedule, ScheduledTask } from "node-cron";
import { checkOverdueFollowups, checkUpcomingEvents, generateMorningSummary, checkExpiringContracts, checkOverdueBills } from "./proactive-engine";
import { canSendProactive, recordProactiveSent } from "./rate-limiter";
import { getNotifyOwnerCallback, getSendMessageCallback } from "../ai/callbacks";
import { shouldSendProactive } from "../operational-rules";

const tasks: ScheduledTask[] = [];

// Map scheduler source names to proactive rule types
const SOURCE_TO_PROACTIVE_TYPE: Record<string, string> = {
  followup: "followup_reminder",
  calendar: "pre_meeting",
  morning: "morning_summary",
  contracts: "contract_renewal",
  bills: "bill_overdue",
};

async function trySendProactive(
  generator: () => ProactiveResult | Promise<ProactiveResult>,
  source: string
): Promise<void> {
  // Check operational rules — owner can block specific proactive message types
  const proactiveType = SOURCE_TO_PROACTIVE_TYPE[source];
  if (proactiveType && !shouldSendProactive(proactiveType)) {
    console.log(`[proactive:${source}] Blocked by operational rule`);
    return;
  }

  const check = canSendProactive();
  if (!check.allowed) {
    console.log(`[proactive:${source}] Blocked: ${check.reason}`);
    return;
  }

  try {
    const message = await generator();
    if (!message) return;

    // Route to target contact if specified, otherwise to owner
    if (message.targetChatId && message.targetMessage) {
      const sendMessage = getSendMessageCallback();
      if (!sendMessage) {
        console.log(`[proactive:${source}] No sendMessage callback for target`);
        return;
      }
      await sendMessage(message.targetChatId, message.targetMessage);
      recordProactiveSent();
      console.log(`[proactive:${source}] Sent to contact ${message.targetChatId}: ${message.type}`);

      // Also notify owner that the reminder was sent
      const notify = getNotifyOwnerCallback();
      if (notify) {
        await notify(message.text);
      }
    } else {
      const notify = getNotifyOwnerCallback();
      if (!notify) {
        console.log(`[proactive:${source}] No notify callback`);
        return;
      }
      await notify(message.text);
      recordProactiveSent();
      console.log(`[proactive:${source}] Sent: ${message.type}`);
    }
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

  // Every 2 minutes: check overdue followups (needs to be frequent for exact-time reminders)
  tasks.push(
    schedule("*/2 * * * *", () => {
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

  // Daily at 10:00: check expiring contracts
  tasks.push(
    schedule("0 10 * * *", () => {
      trySendProactive(checkExpiringContracts, "contracts");
    }, tz)
  );

  // Daily at 09:00: check overdue/due bills
  tasks.push(
    schedule("0 9 * * *", () => {
      trySendProactive(checkOverdueBills, "bills");
    }, tz)
  );

  console.log("[proactive] Scheduler started (followups:2m, calendar:30m, morning:07:30, bills:09:00, contracts:10:00)");
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
