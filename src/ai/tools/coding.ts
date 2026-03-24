import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Self-programming / coding tools (owner-only) */
export const codingTools: Anthropic.Tool[] = [
  {
    name: "code_start_session",
    description: "התחלת session תכנות — יוצרת worktree מבודד לעבודה בטוחה על הקוד. חובה לפני כתיבת/עריכת קוד.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה היכולת שעובדים עליה (cap-XXX). אם אין — תני שם ייחודי.",
        },
      },
      required: ["capability_id"],
    },
  },
  {
    name: "code_read",
    description: "קריאת קובץ מקור מהפרויקט. אפשר לקרוא src/, workspace/, tests/ וכו'.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לשורש הפרויקט, למשל: 'src/ai/tools/index.ts')",
        },
        capability_id: {
          type: "string",
          description: "אם עובדים ב-worktree — קראי מהעותק המבודד. אחרת קוראת מ-production.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "code_write",
    description: "כתיבת/עריכת קובץ ב-worktree המבודד. לא משנה קבצי production!",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree",
        },
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לשורש, למשל: 'src/telegram.ts')",
        },
        content: {
          type: "string",
          description: "תוכן הקובץ החדש",
        },
      },
      required: ["capability_id", "path", "content"],
    },
  },
  {
    name: "code_execute",
    description: "הרצת פקודת shell ב-worktree מבודד. להרצת build, test, או פקודות אחרות.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree",
        },
        command: {
          type: "string",
          description: "הפקודה להרצה (למשל: 'npx tsc', 'cat src/index.ts', 'ls src/')",
        },
      },
      required: ["capability_id", "command"],
    },
  },
  {
    name: "code_build_test",
    description: "בנייה ובדיקה של הקוד ב-worktree. מריץ TypeScript compile.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree",
        },
      },
      required: ["capability_id"],
    },
  },
  {
    name: "code_show_diff",
    description: "הצגת כל השינויים שנעשו ב-worktree לעומת production.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree",
        },
      },
      required: ["capability_id"],
    },
  },
  {
    name: "code_apply",
    description: `⚠️ החלת השינויים לפרודקשן! מחייב אישור מפורש מ${config.ownerName}. ממזג את הקוד, בונה מחדש, ומריסטרט את ${config.botName}.`,
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree להחלה",
        },
      },
      required: ["capability_id"],
    },
  },
  {
    name: "code_cleanup",
    description: "ביטול וניקוי worktree בלי להחיל שינויים.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-worktree לניקוי",
        },
      },
      required: ["capability_id"],
    },
  },
  {
    name: "code_implement",
    description: `⚡ הפעלת Claude Code לממש capability spec שאושרה. Claude Code כותב קוד, מקמפל, ומציג diff. השתמשי אחרי ש${config.ownerName} אישר יכולת עם 'אשר יכולת cap-XXX'.`,
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה ה-capability spec לממש (cap-XXX)",
        },
      },
      required: ["capability_id"],
    },
  },
];
