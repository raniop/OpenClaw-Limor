/**
 * Amit Scheduler — runs daily dependency update checks.
 * Checks npm outdated, updates minor/patch only, builds, tests,
 * and deploys if successful. Reports to Rani on failure.
 */
import { schedule, ScheduledTask } from "node-cron";
import { getAgent } from "../agent-registry";
import { runAgent } from "../agent-runner";
import { getNotifyOwnerCallback } from "../../ai/callbacks";

let amitTask: ScheduledTask | null = null;

const AMIT_TASK = `בצע בדיקת עדכוני dependencies מלאה לפי הפרוטוקול הבא:

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

**חשוב:** אם שלב כלשהו נכשל — דווח בפירוט ואל תפרוס!`;

export async function runAmitDependencyCheck(): Promise<void> {
  console.log("[amit] 📦 Starting daily dependency check...");

  const agent = getAgent("amit");
  if (!agent) {
    console.error("[amit] ❌ Agent 'amit' not found in registry");
    return;
  }

  try {
    const result = await runAgent(agent, AMIT_TASK);
    console.log(`[amit] ✅ Done in ${result.durationMs}ms`);

    // Always notify owner with the result
    const notify = getNotifyOwnerCallback();
    if (notify && result.text) {
      await notify(result.text);
      console.log("[amit] 📤 Report sent to owner");
    }
  } catch (err: any) {
    console.error("[amit] ❌ Dependency check failed:", err.message);
    const notify = getNotifyOwnerCallback();
    if (notify) {
      await notify(
        `📦 עמית — שגיאה בבדיקת dependencies\n\n❌ ${err.message}\n\nלא בוצע deploy.`
      );
    }
  }
}

/**
 * Start the Amit daily scheduler.
 * Runs every day at 03:00 Israel time (low-traffic window).
 */
export function startAmitScheduler(): void {
  if (amitTask) {
    console.log("[amit] Scheduler already running");
    return;
  }

  const tz = { timezone: "Asia/Jerusalem" as const };

  // Daily at 03:00 Israel time — low traffic window
  amitTask = schedule("0 3 * * *", () => {
    runAmitDependencyCheck().catch((err) =>
      console.error("[amit] Unhandled error in scheduled run:", err)
    );
  }, tz);

  console.log("[amit] 📦 Scheduler started (daily at 03:00 Israel time)");
}

/**
 * Stop the Amit scheduler.
 */
export function stopAmitScheduler(): void {
  if (amitTask) {
    amitTask.stop();
    amitTask = null;
    console.log("[amit] Scheduler stopped");
  }
}
