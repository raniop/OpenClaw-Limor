import Anthropic from "@anthropic-ai/sdk";

/** Monitoring tools for system health checks */
export const monitoringTools: Anthropic.Tool[] = [
  {
    name: "full_system_report",
    description: "דוח מלא על המערכת — בריאות, שגיאות, וסטטוס סוכנים. תמיד תשתמש בזה ראשון! זה הכלי הכי חשוב שלך.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "system_health_check",
    description: "בדיקת בריאות המערכת — סטטוס WhatsApp, SQLite, סוכנות, שגיאות אחרונות",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_error_logs",
    description: "שליפת שגיאות אחרונות מהלוגים",
    input_schema: {
      type: "object" as const,
      properties: {
        hours: {
          type: "number",
          description: "כמה שעות אחורה לבדוק (ברירת מחדל: 24)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_agent_stats",
    description: "סטטיסטיקות שימוש בסוכנות — כמה פעמים כל סוכנת הופעלה, זמני תגובה ממוצעים",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
