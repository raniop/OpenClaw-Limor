import Anthropic from "@anthropic-ai/sdk";

/** File management tools (owner-only) */
export const fileTools: Anthropic.Tool[] = [
  {
    name: "list_files",
    description: "הצגת רשימת קבצים בתיקייה",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description: "תיקיית משנה (אופציונלי, ברירת מחדל: תיקייה ראשית)",
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description: "קריאת תוכן קובץ טקסט",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לתיקיית files)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "save_file",
    description: "שמירת קובץ חדש",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "נתיב הקובץ (יחסי לתיקיית files)",
        },
        content: {
          type: "string",
          description: "תוכן הקובץ",
        },
      },
      required: ["path", "content"],
    },
  },
];
