/**
 * Agent Lifecycle Manager — schedules and runs autonomous agents.
 * Generalizes the Amit scheduler pattern for all agents.
 */
import { schedule, ScheduledTask } from "node-cron";
import { listAgents, getAgent } from "../agent-registry";
import { runAgent } from "../agent-runner";
import type { AgentConfig } from "../agent-types";
import { agentEventBus } from "./agent-event-bus";
import { getAllAgentState, setAgentState, logAgentRun, getLastRunTime } from "./agent-state-store";
import { getNotifyOwnerCallback } from "../../ai/callbacks";

const scheduledTasks: Map<string, ScheduledTask> = new Map();
const _lastAlertTime: Map<string, number> = new Map();

/** Per-agent autonomous task prompts */
const AUTONOMOUS_TASKS: Record<string, string> = {
  amit: `בצע בדיקת עדכוני dependencies מלאה לפי הפרוטוקול הבא:

1. הרץ: npm outdated --json כדי לקבל רשימת dependencies מיושנות
2. נתח את הפלט — חלק לשתי קבוצות:
   - SAFE: חבילות שה-wanted version שלהן שומרת על אותו major (לדוגמה: 1.2.3 → 1.9.0)
   - SKIP: חבילות שה-wanted version שלהן מעלה את ה-major (לדוגמה: 1.2.3 → 2.0.0)
3. אם אין חבילות ב-SAFE — דווח "הכל עדכני" וסיים
4. עדכן רק חבילות SAFE: הרץ npm update
5. הרץ build: npm run build
6. אם build נכשל:
   a. שחזר: git checkout -- package.json package-lock.json
   b. הרץ npm install לשחזור
   c. דווח על הכשל עם פרטים מלאים — אל תפרוס!
7. הרץ טסטים: npm test
8. אם טסטים נכשלו:
   a. שחזר: git checkout -- package.json package-lock.json
   b. הרץ npm install לשחזור
   c. דווח על הכשל עם פרטים מלאים — אל תפרוס!
9. אם הכל עבר — עשה commit: git add package.json package-lock.json && git commit -m "chore: update minor/patch dependencies (auto by Amit)"
10. פרוס: restart_and_deploy
11. דווח סיכום מלא בפורמט:
📦 *דוח עדכון dependencies — עמית*
✅ עודכנו: [רשימת חבילות + גרסאות]
⏭️ דולגו (major): [רשימת חבילות + גרסאות]
🚀 סטטוס: פרוס בהצלחה

**חשוב:** אם שלב כלשהו נכשל — דווח בפירוט ואל תפרוס!`,

  boris: `בצע בדיקת בריאות מהירה:
1. הרץ full_system_report
2. השווה לתוצאה האחרונה (מצב קודם למטה)
3. אם יש שינוי לרעה (שגיאות חדשות, סוכנת שנפלה, WhatsApp מנותק, PM2 restarts) — החזר את ההתראה בלבד
4. אם הכל תקין — החזר רק "ok"
אל תחזיר דוח מלא אם הכל תקין. רק "ok" או התראה ספציפית.`,

  michal: `סכמי את כל הקבוצות הפעילות היום.
1. השתמשי ב-get_group_history וב-summarize_group_activity לכל קבוצה פעילה
2. אם אין פעילות משמעותית בקבוצה — דלגי עליה
3. החזירי סיכום אחד מאוחד עם כל הקבוצות בפורמט:

*סיכום קבוצות היום:*

*שם קבוצה:*
- נקודה קצרה
- נקודה קצרה

אם אין פעילות בכלל — החזירי "אין פעילות משמעותית בקבוצות היום."`,
};

function isQuietHours(): boolean {
  const now = new Date();
  const israelHour = parseInt(
    now.toLocaleTimeString("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" })
  );
  return israelHour >= 23 || israelHour < 7;
}

function matchesFilter(data: any, filter?: Record<string, any>): boolean {
  if (!filter) return true;
  for (const [key, value] of Object.entries(filter)) {
    if (data[key] !== value) return false;
  }
  return true;
}

/**
 * Run an autonomous agent with rate limiting, state injection, logging, and notification.
 */
export async function runAutonomousAgent(
  agent: AgentConfig,
  trigger: string,
  eventData?: any,
): Promise<void> {
  const ac = agent.autonomousConfig;
  if (!ac?.enabled) return;

  // Rate limit check
  if (ac.minIntervalMs) {
    const lastRun = getLastRunTime(agent.id);
    if (lastRun && Date.now() - lastRun < ac.minIntervalMs) {
      console.log(`[autonomous:${agent.id}] Skipped — too soon (${Math.round((Date.now() - lastRun) / 1000)}s since last run)`);
      return;
    }
  }

  // Quiet hours check (skip for critical triggers)
  if (isQuietHours() && trigger === "cron") {
    console.log(`[autonomous:${agent.id}] Skipped — quiet hours`);
    return;
  }

  console.log(`[autonomous:${agent.id}] Starting (trigger: ${trigger})`);
  const startTime = Date.now();

  // Build task prompt
  let task = AUTONOMOUS_TASKS[agent.id] || `בצע את המשימה האוטונומית שלך.`;

  // Inject previous state
  const state = getAllAgentState(agent.id);
  if (Object.keys(state).length > 0) {
    const stateLines = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join("\n");
    task += `\n\n[מצב קודם]\n${stateLines}`;
  }

  // Inject event data if present
  if (eventData) {
    task += `\n\n[אירוע שהפעיל אותך]\n${JSON.stringify(eventData)}`;
  }

  try {
    const result = await runAgent(agent, task);
    const durationMs = Date.now() - startTime;
    const summary = result.text.substring(0, 200);

    console.log(`[autonomous:${agent.id}] Done in ${durationMs}ms`);

    // Log run
    logAgentRun(
      agent.id, trigger, "success", result.text,
      result.tokensUsed.input, result.tokensUsed.output, durationMs,
    );

    // Update state
    setAgentState(agent.id, "lastRunAt", new Date().toISOString());
    setAgentState(agent.id, "lastResult", summary);
    setAgentState(agent.id, "lastStatus", "success");

    // Notify owner if configured and result is meaningful
    if (ac.notifyOwner) {
      const notify = getNotifyOwnerCallback();
      if (notify && result.text) {
        await notify(result.text);
        console.log(`[autonomous:${agent.id}] Report sent to owner`);
      }
    } else {
      // For silent agents (like Boris) — only notify on alerts, with 3h cooldown
      const isAlert = result.text.trim().toLowerCase() !== "ok" && result.text.trim() !== "";
      if (isAlert) {
        const ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
        const lastAlertAt = _lastAlertTime.get(agent.id) || 0;
        const now = Date.now();
        if (now - lastAlertAt >= ALERT_COOLDOWN_MS) {
          const notify = getNotifyOwnerCallback();
          if (notify) {
            await notify(`${agent.emoji} ${agent.name} — התראה:\n\n${result.text}`);
            console.log(`[autonomous:${agent.id}] Alert sent to owner`);
            _lastAlertTime.set(agent.id, now);
          }
        } else {
          console.log(`[autonomous:${agent.id}] Alert suppressed (cooldown, last alert ${Math.round((now - lastAlertAt) / 60000)}m ago)`);
        }
      }
    }

    // Emit completion event
    agentEventBus.emitTyped("agent:completed", {
      agentId: agent.id,
      trigger,
      resultSummary: summary,
      durationMs,
    });

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[autonomous:${agent.id}] Error: ${err.message}`);

    logAgentRun(agent.id, trigger, "error", err.message, 0, 0, durationMs);
    setAgentState(agent.id, "lastStatus", "error");
    setAgentState(agent.id, "lastError", err.message);

    agentEventBus.emitTyped("agent:error", { agentId: agent.id, error: err.message });

    // Always notify owner on errors
    const notify = getNotifyOwnerCallback();
    if (notify) {
      await notify(`${agent.emoji} ${agent.name} — שגיאה:\n\n${err.message}`);
    }
  }
}

/**
 * Start all autonomous agents based on their soul config.
 */
export function startAutonomousAgents(): void {
  const tz = { timezone: "Asia/Jerusalem" as const };
  let count = 0;

  for (const agent of listAgents()) {
    const ac = agent.autonomousConfig;
    if (!ac?.enabled) continue;

    // Register cron schedule
    if (ac.schedule) {
      const task = schedule(ac.schedule, () => {
        runAutonomousAgent(agent, "cron").catch((err) =>
          console.error(`[autonomous:${agent.id}] Unhandled error:`, err)
        );
      }, tz);
      scheduledTasks.set(agent.id, task);
      console.log(`[autonomous] ${agent.emoji} ${agent.name} scheduled: ${ac.schedule}`);
      count++;
    }

    // Register event triggers
    if (ac.triggers) {
      for (const trigger of ac.triggers) {
        agentEventBus.onTyped(trigger.event as any, (data: any) => {
          if (matchesFilter(data, trigger.filter)) {
            runAutonomousAgent(agent, `event:${trigger.event}`, data).catch((err) =>
              console.error(`[autonomous:${agent.id}] Event handler error:`, err)
            );
          }
        });
        console.log(`[autonomous] ${agent.emoji} ${agent.name} listens: ${trigger.event}`);
      }
    }
  }

  // Handle inter-agent requests
  agentEventBus.onTyped("agent:request", async ({ fromAgent, toAgent, task, context }) => {
    const targetAgent = getAgent(toAgent);
    if (!targetAgent) {
      console.error(`[autonomous] agent:request — agent "${toAgent}" not found`);
      return;
    }
    const enrichedTask = `[בקשה מ-${fromAgent}]\n${task}${context ? `\n\n${context}` : ""}`;
    await runAutonomousAgent(targetAgent, `request:${fromAgent}`, { task: enrichedTask });
  });

  console.log(`[autonomous] ${count} agents scheduled`);
}

/**
 * Stop all autonomous agent schedulers.
 */
export function stopAutonomousAgents(): void {
  for (const [id, task] of scheduledTasks) {
    task.stop();
    console.log(`[autonomous] Stopped: ${id}`);
  }
  scheduledTasks.clear();
}
