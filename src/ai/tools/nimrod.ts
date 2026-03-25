/**
 * Nimrod Cyber Agent — Tool Definitions
 * Security scanning tools for macOS production server
 */
import Anthropic from "@anthropic-ai/sdk";

export const nimrodTools: Anthropic.Tool[] = [
  {
    name: "nimrod_run_scan",
    description: "סריקת סייבר מלאה — מריץ את כל מודולי הזיהוי במקביל: תהליכים, persistence, רשת, קבצים, הרשאות. מחזיר דוח מאוחד עם ציון סיכון.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_scan_processes",
    description: "סריקת תהליכים — ניתוח תהליכים רצים, CPU/memory חריגים, תהליכים מנתיבים חשודים, patterns של malware",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_scan_persistence",
    description: "סריקת persistence — LaunchAgents, LaunchDaemons, Login Items, cron jobs, shell profiles",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_scan_network",
    description: "סריקת רשת — שירותים מאזינים, חיבורים פעילים לחוץ, פורטים חשודים, C2 indicators",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_scan_filesystem",
    description: "סריקת מערכת קבצים — קבצים שהשתנו לאחרונה בתיקיות קריטיות, executables ב-/tmp, קבצים מוסתרים חשודים",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_scan_permissions",
    description: "סריקת הרשאות — TCC, sudo NOPASSWD, SUID binaries, world-writable files, SSH keys, .env permissions",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "nimrod_get_alerts",
    description: "שליפת התראות שמורות של נמרוד — היסטוריה של ממצאים, סטטוס throttle",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "כמה התראות לשלוף (ברירת מחדל: 20)",
        },
      },
      required: [],
    },
  },
];
