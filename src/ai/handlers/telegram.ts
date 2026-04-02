import type { ToolHandler } from "./types";
import { isConnected, getTelegramGroupMessages, listTelegramGroups } from "../../telegram/client";

export const telegramHandlers: Record<string, ToolHandler> = {
  telegram_summary: async (input) => {
    if (!isConnected()) {
      return "❌ טלגרם לא מחובר. צריך להגדיר TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE ב-.env ולהריץ אימות ראשוני.";
    }

    const groupName = input.group_name;
    const hours = input.hours || 24;

    try {
      const messages = await getTelegramGroupMessages(groupName, hours);

      if (messages.length === 0) {
        return `אין הודעות בקבוצה "${groupName}" ב-${hours} השעות האחרונות.`;
      }

      const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });

      // Log raw messages for debugging
      console.log(`[telegram] Raw messages from "${groupName}" (${messages.length}):\n${messages.slice(0, 10).join("\n")}\n... (${messages.length} total)`);

      return (
        `📋 הודעות מקבוצת "${groupName}" (${today}, ${hours} שעות אחרונות):\n` +
        `סה"כ ${messages.length} הודעות.\n\n` +
        messages.join("\n") +
        "\n\n---\n" +
        "⚠️ חוקי ברזל לסיכום:\n" +
        "1. אסור להמציא, לפרש, או להוסיף מידע שלא כתוב מילה במילה בהודעות. לא לשנות ניסוח, לא להסיק מסקנות.\n" +
        "2. קצר מאוד! מקסימום 10-12 נקודות בסה\"כ לכל הסיכום. רק האירועים הכי חשובים.\n" +
        "3. כל נקודה = חצי משפט. למשל: '- שיגורים מאיראן — עד כה ללא נפגעים'\n" +
        "4. פורמט מדויק:\n" +
        "סיכום היום מ[שם] (תאריך):\n\n*איראן:*\n- נקודה קצרה\n- נקודה קצרה\n\n*לבנון:*\n- נקודה קצרה\n\n" +
        "5. בלי אימוג'ים. בלי כותרות משנה. בלי הסברים. בלי 'סה\"כ' או 'בשורה תחתונה'. רק עובדות יבשות קצרות."
      );
    } catch (err: any) {
      return `❌ שגיאה בקריאת טלגרם: ${err.message}`;
    }
  },

  list_telegram_groups: async () => {
    if (!isConnected()) {
      return "❌ טלגרם לא מחובר.";
    }

    try {
      const groups = await listTelegramGroups();

      if (groups.length === 0) {
        return "לא נמצאו קבוצות או ערוצים.";
      }

      return (
        `📋 ${groups.length} קבוצות/ערוצים בטלגרם:\n\n` +
        groups.map((g) => `• ${g.title} (${g.type === "channel" ? "ערוץ" : "קבוצה"})`).join("\n")
      );
    } catch (err: any) {
      return `❌ שגיאה: ${err.message}`;
    }
  },
};
