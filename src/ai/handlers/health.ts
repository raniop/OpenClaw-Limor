/**
 * Health handlers — Apple Health data.
 * Data is pushed from iPhone via /health-data webhook and stored in SQLite.
 */
import type { ToolHandler } from "./types";
import { getTodayHealth, getHealthByDate, getRecentHealth } from "../../stores/health-store";
import { config } from "../../config";

// Daily calorie goal — optional, set via HEALTH_DAILY_CALORIE_GOAL env var.
const DAILY_CALORIE_GOAL = parseInt(process.env.HEALTH_DAILY_CALORIE_GOAL || "0", 10) || 0;

function formatHealthRecord(record: {
  date: string;
  steps: number | null;
  calories_burned: number | null;
  active_calories: number | null;
  exercise_minutes: number | null;
  distance_km: number | null;
  stand_hours: number | null;
  resting_heart_rate: number | null;
  created_at: string;
}): string {
  const lines: string[] = [];
  lines.push(`📅 תאריך: ${record.date}`);

  if (record.steps !== null) {
    const stepGoal = 10000;
    const stepPct = Math.round((record.steps / stepGoal) * 100);
    lines.push(`👟 צעדים: ${record.steps.toLocaleString()} / ${stepGoal.toLocaleString()} (${stepPct}%)`);
  }

  if (record.distance_km !== null) {
    lines.push(`📍 מרחק: ${record.distance_km.toFixed(1)} ק"מ`);
  }

  if (record.calories_burned !== null) {
    lines.push(`🔥 קלוריות שרופות (סה"כ): ${record.calories_burned} קל'`);
  }

  if (record.active_calories !== null) {
    if (DAILY_CALORIE_GOAL > 0) {
      const remaining = DAILY_CALORIE_GOAL - record.active_calories;
      const remainingText = remaining > 0
        ? `נותרו ${remaining} קל' ליעד`
        : `✅ עברת את היעד ב-${Math.abs(remaining)} קל'!`;
      lines.push(`⚡ קלוריות פעילות: ${record.active_calories} קל' (${remainingText})`);
    } else {
      lines.push(`⚡ קלוריות פעילות: ${record.active_calories} קל'`);
    }
  }

  if (record.exercise_minutes !== null) {
    const exGoal = 30;
    const exStatus = record.exercise_minutes >= exGoal ? "✅" : "⏳";
    lines.push(`🏃 פעילות גופנית: ${record.exercise_minutes} דקות ${exStatus}`);
  }

  if (record.stand_hours !== null) {
    lines.push(`🧍 שעות עמידה: ${record.stand_hours}/12`);
  }

  if (record.resting_heart_rate !== null) {
    lines.push(`❤️ דופק במנוחה: ${record.resting_heart_rate} bpm`);
  }

  if (record.active_calories !== null && DAILY_CALORIE_GOAL > 0) {
    const totalBudget = DAILY_CALORIE_GOAL + record.active_calories;
    lines.push(`\n💡 תקציב קלורי: ${DAILY_CALORIE_GOAL} קל' בסיס + ${record.active_calories} קל' שנשרפו = ${totalBudget} קל' מותר לאכול`);
  }

  const updatedAt = new Date(record.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  lines.push(`\n🕐 עודכן: ${updatedAt}`);

  return lines.join("\n");
}

export const healthHandlers: Record<string, ToolHandler> = {
  get_health_data: async (input) => {
    const { date } = input;

    // Last 7 days summary
    if (date === "last_7_days") {
      const records = getRecentHealth(7);
      if (records.length === 0) {
        return `❌ אין נתוני בריאות זמינים. ${config.ownerName} צריך להגדיר את ה-iOS Shortcut שישלח נתונים אוטומטית.`;
      }
      const lines = [`📊 נתוני Apple Health — 7 ימים אחרונים:\n`];
      for (const r of records) {
        lines.push(formatHealthRecord(r));
        lines.push("─────────────────");
      }
      const avgSteps = Math.round(records.filter(r => r.steps).reduce((s, r) => s + (r.steps || 0), 0) / records.filter(r => r.steps).length);
      const avgCal = Math.round(records.filter(r => r.active_calories).reduce((s, r) => s + (r.active_calories || 0), 0) / records.filter(r => r.active_calories).length);
      lines.push(`\n📈 ממוצע שבועי: ${avgSteps.toLocaleString()} צעדים | ${avgCal} קל' פעילות`);
      return lines.join("\n");
    }

    // Specific date
    if (date) {
      const record = getHealthByDate(date);
      if (!record) {
        return `❌ אין נתוני בריאות לתאריך ${date}. ייתכן שה-Shortcut לא שלח נתונים לתאריך זה.`;
      }
      return `📊 נתוני Apple Health:\n\n${formatHealthRecord(record)}`;
    }

    // Today (default)
    const record = getTodayHealth();
    if (!record) {
      const today = new Date().toISOString().split("T")[0];
      return `❌ אין עדיין נתוני בריאות להיום (${today}).\n\n` +
        `💡 כדי לקבל נתונים אוטומטיים, ${config.ownerName} צריך להגדיר iOS Shortcut שמריץ כל שעה ושולח POST ל-/health-data.\n` +
        `הנחיות הגדרה: שאל את ${config.botName} "תסביר לי איך להגדיר את Shortcut הבריאות"`;
    }

    return `📊 נתוני Apple Health — היום:\n\n${formatHealthRecord(record)}`;
  },
};
