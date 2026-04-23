import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

export const telegramTools: Anthropic.Tool[] = [
  {
    name: "telegram_summary",
    description:
      "קריאת הודעות אחרונות מקבוצה או ערוץ בטלגרם וסיכום שלהן. " +
      "מחזיר את ההודעות הגולמיות — את צריכה לסכם אותן בפורמט מסודר לפי נושאים.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה או הערוץ בטלגרם (חיפוש חלקי עובד)",
        },
        hours: {
          type: "number",
          description: "כמה שעות אחורה לקרוא (ברירת מחדל: 24)",
        },
      },
      required: ["group_name"],
    },
  },
  {
    name: "list_telegram_groups",
    description: `רשימת קבוצות וערוצי טלגרם ש${config.ownerName} חבר בהם`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
