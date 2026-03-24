import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

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
  {
    name: "get_recent_changes",
    description: "שינויים אחרונים בקוד המערכת — git commits, קבצים שהשתנו, מה נוסף/נמחק",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "כמה ימים אחורה לבדוק (ברירת מחדל: 1)",
        },
      },
      required: [],
    },
  },
  {
    name: "run_command",
    description: "הרצת פקודה על השרת (npm build, pm2 restart, git pull וכו')",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "הפקודה להרצה" },
        timeout: { type: "number", description: "timeout במילישניות (ברירת מחדל: 30000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "pm2_manage",
    description: "ניהול PM2 — restart, stop, status, logs",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["restart", "stop", "status", "logs"], description: "פעולה" },
        process: { type: "string", description: "שם התהליך (ברירת מחדל: limor)" },
        lines: { type: "number", description: "כמה שורות לוג (ברירת מחדל: 30)" },
      },
      required: ["action"],
    },
  },
  {
    name: "tail_logs",
    description: `צפייה בלוגים אחרונים של ${config.botName}`,
    input_schema: {
      type: "object" as const,
      properties: {
        lines: { type: "number", description: "כמה שורות (ברירת מחדל: 50)" },
        filter: { type: "string", description: "פילטר regex" },
      },
      required: [],
    },
  },
  {
    name: "git_manage",
    description: "פעולות Git — pull, status, stash, log, diff",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["pull", "status", "stash", "log", "diff"], description: "פעולה" },
        args: { type: "string", description: "ארגומנטים נוספים" },
      },
      required: ["action"],
    },
  },
  {
    name: "edit_file",
    description: "עריכת קובץ — חיפוש והחלפה",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ (יחסי לפרויקט)" },
        search: { type: "string", description: "טקסט לחיפוש" },
        replace: { type: "string", description: "טקסט להחלפה" },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "read_file_source",
    description: "קריאת קובץ מקוד המערכת",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ (יחסי לפרויקט)" },
        startLine: { type: "number", description: "שורה התחלתית" },
        endLine: { type: "number", description: "שורה סופית" },
      },
      required: ["path"],
    },
  },
  {
    name: "npm_manage",
    description: "פעולות NPM — build, test, install",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["build", "test", "install"], description: "פעולה" },
        args: { type: "string", description: "ארגומנטים נוספים" },
      },
      required: ["action"],
    },
  },
  {
    name: "restart_and_deploy",
    description: `בנייה מחדש והפעלה מחדש של ${config.botName}`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
