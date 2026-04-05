import { SONNET } from "../ai/model-router";

/**
 * Insight Scheduler — nightly analysis of owner conversations.
 * Generates behavioral patterns and insights using Claude,
 * then stores them in the owner's memory patterns field.
 * Runs daily at 02:00 Israel time.
 */
import { schedule, ScheduledTask } from "node-cron";
import { client as aiClient, withRetry } from "../ai/client";
import { config } from "../config";
import { conversationStore } from "../stores";
import { replacePatterns, getMemoryContext } from "../memory";
import { getNotifyOwnerCallback } from "../ai/callbacks";

let insightTask: ScheduledTask | null = null;

const MAX_MESSAGES = 200;
const MAX_MSG_LENGTH = 300;
const MIN_MESSAGES = 10;
const ANALYSIS_DAYS = 7;

const ANALYSIS_PROMPT = `אתה מנתח התנהגותי. אתה מקבל היסטוריית שיחות של 7 ימים אחרונים בין משתמש לבין עוזרת AI.
משימתך: לזהות דפוסים התנהגותיים, העדפות, והרגלים של המשתמש.

## מה לנתח:
- **תזמון:** מתי המשתמש פעיל, מתי מגיב מהר/לאט
- **סגנון תקשורת:** קצר/מפורט, פורמלי/לא-פורמלי, שפה מועדפת
- **נטיות החלטה:** ספונטני/מתוכנן, מהיר/שקול
- **נושאים חוזרים:** מה מעסיק אותו, מה חוזר שוב ושוב
- **העדפות:** מה אוהב, מה לא אוהב, מה מבקש באופן קבוע
- **רגשות:** מתי נוטה ללחץ, מה משמח אותו

## דפוסים קיימים (למיזוג):
{EXISTING_PATTERNS}

## הוראות:
- מזג עם הדפוסים הקיימים: שמור מה שעדיין רלוונטי, עדכן מה שהשתנה, הסר מה שלא מתאים יותר
- מקסימום 15 דפוסים
- כל דפוס: משפט קצר וברור בעברית
- החזר JSON בלבד, ללא טקסט נוסף

## פורמט תשובה (JSON בלבד):
{
  "patterns": ["דפוס 1", "דפוס 2", ...],
  "changes": "תיאור קצר של מה השתנה לעומת הדפוסים הקודמים"
}`;

/**
 * Run the insight analysis for the owner.
 */
export async function runInsightAnalysis(): Promise<void> {
  const ownerChatId = config.ownerChatId;
  if (!ownerChatId) {
    console.log("[insights] No owner chat ID configured, skipping");
    return;
  }

  console.log("[insights] Starting nightly insight analysis...");

  // 1. Get recent conversations
  const recentMessages = (conversationStore as any).getRecentHistory(ownerChatId, ANALYSIS_DAYS) as Array<{
    role: string;
    content: string;
    created_at: string;
  }>;

  if (recentMessages.length < MIN_MESSAGES) {
    console.log(`[insights] Only ${recentMessages.length} messages in last ${ANALYSIS_DAYS} days, skipping (min: ${MIN_MESSAGES})`);
    return;
  }

  // 2. Prepare conversation data (truncate + cap)
  const trimmed = recentMessages.slice(-MAX_MESSAGES).map((m) => {
    const content = m.content.length > MAX_MSG_LENGTH ? m.content.slice(0, MAX_MSG_LENGTH) + "..." : m.content;
    return `[${m.created_at}] ${m.role}: ${content}`;
  });

  // 3. Load existing patterns
  const memoryContext = getMemoryContext(ownerChatId);
  const existingPatternsMatch = memoryContext?.match(/### דפוסים שזיהית\n([\s\S]*?)(?:\n###|$)/);
  const existingPatterns = existingPatternsMatch ? existingPatternsMatch[1].trim() : "אין דפוסים קיימים";

  // 4. Build prompt
  const prompt = ANALYSIS_PROMPT.replace("{EXISTING_PATTERNS}", existingPatterns);

  // 5. Call Claude
  try {
    const response = await withRetry(() =>
      aiClient.messages.create({
        model: SONNET,
        max_tokens: 1024,
        system: prompt,
        messages: [
          {
            role: "user",
            content: `היסטוריית שיחות (${recentMessages.length} הודעות, ${ANALYSIS_DAYS} ימים אחרונים):\n\n${trimmed.join("\n")}`,
          },
        ],
      })
    );

    // 6. Parse response
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[insights] Failed to parse JSON from response:", text.slice(0, 200));
      return;
    }

    const result = JSON.parse(jsonMatch[0]) as { patterns: string[]; changes: string };

    if (!Array.isArray(result.patterns) || result.patterns.length === 0) {
      console.log("[insights] No patterns returned, skipping update");
      return;
    }

    // 7. Save patterns
    replacePatterns(ownerChatId, result.patterns);
    console.log(`[insights] Saved ${result.patterns.length} patterns for owner`);

    // 8. Notify owner
    const notify = getNotifyOwnerCallback();
    if (notify && result.changes && result.changes !== "אין שינוי") {
      const patternList = result.patterns.map((p) => `• ${p}`).join("\n");
      await notify(`🧠 *תובנות שזיהיתי עליך:*\n${patternList}\n\n_${result.changes}_`);
      console.log("[insights] Report sent to owner");
    }
  } catch (err: any) {
    console.error("[insights] Analysis failed:", err.message);
  }
}

/**
 * Start the insight scheduler.
 * Runs daily at 02:00 Israel time.
 */
export function startInsightScheduler(): void {
  if (insightTask) {
    console.log("[insights] Scheduler already running");
    return;
  }

  const tz = { timezone: "Asia/Jerusalem" as const };

  insightTask = schedule("0 2 * * *", () => {
    runInsightAnalysis().catch((err) =>
      console.error("[insights] Unhandled error in scheduled run:", err)
    );
  }, tz);

  console.log("[insights] 🧠 Scheduler started (daily at 02:00 Israel time)");
}

/**
 * Stop the insight scheduler.
 */
export function stopInsightScheduler(): void {
  if (insightTask) {
    insightTask.stop();
    insightTask = null;
    console.log("[insights] Scheduler stopped");
  }
}
