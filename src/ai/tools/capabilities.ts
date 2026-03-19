import Anthropic from "@anthropic-ai/sdk";

/** Capability learning tools (owner-only) */
export const capabilityTools: Anthropic.Tool[] = [
  {
    name: "create_capability_request",
    description:
      "יצירת בקשת יכולת חדשה. השתמשי כשרני מבקש ממך ללמוד לעשות משהו חדש שדורש שינוי קוד, tool חדש, אינטגרציה חדשה, או שיפור טכני. לא להשתמש בזה לעובדות פשוטות או הוראות התנהגות — רק ליכולות שדורשות פיתוח.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "כותרת קצרה של היכולת המבוקשת",
        },
        problem: {
          type: "string",
          description: "מה המשתמש רוצה שאדע לעשות? מה הבעיה?",
        },
        why_cant_do_it: {
          type: "string",
          description: "למה אני לא יכולה לעשות את זה עכשיו? מה חסר?",
        },
        proposed_solution: {
          type: "string",
          description: "הצעה לפתרון: מה צריך לשנות/להוסיף? tool חדש? API? שינוי prompt? קוד חדש?",
        },
        affected_modules: {
          type: "string",
          description: "רשימת קבצים/מודולים שצריך לשנות, מופרדים בפסיקים",
        },
        level: {
          type: "string",
          description: "רמת השינוי: prompt_only | retrieval | tool_addition | code_change | integration",
        },
        risks: {
          type: "string",
          description: "סיכונים אפשריים, מופרדים בפסיקים",
        },
        validation_plan: {
          type: "string",
          description: "איך לבדוק שזה עובד?",
        },
      },
      required: ["title", "problem", "why_cant_do_it", "proposed_solution", "level"],
    },
  },
  {
    name: "list_capability_requests",
    description: "הצגת בקשות יכולת ממתינות לאישור",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "'pending' או 'approved' או 'all' (ברירת מחדל: pending)",
        },
      },
      required: [],
    },
  },
  {
    name: "run_capability",
    description: "הרצת תהליך מימוש מלא ליכולת שאושרה — יוצר סשן, מממש עם Claude Code, בונה ובודק, מחיל שינויים ומנקה. השתמשי כשרני רוצה לממש יכולת שכבר אושרה.",
    input_schema: {
      type: "object" as const,
      properties: {
        capability_id: {
          type: "string",
          description: "מזהה היכולת (למשל: cap-xxx)",
        },
      },
      required: ["capability_id"],
    },
  },
];
