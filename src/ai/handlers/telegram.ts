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

      return (
        `📋 הודעות מקבוצת "${groupName}" (${today}, ${hours} שעות אחרונות):\n` +
        `סה"כ ${messages.length} הודעות.\n\n` +
        messages.join("\n") +
        "\n\n---\n" +
        "סכמי את ההודעות בפורמט מסודר לפי נושאים עיקריים. " +
        "השתמשי בכותרות לכל נושא ונקודות תבליט לפרטים. תמציתי וברור."
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
