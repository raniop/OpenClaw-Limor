import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

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
  {
    name: "send_file",
    description: "שליחת קובץ כ-attachment בוואטסאפ לאיש קשר או לעצמך (הבעלים). תומך ב-PDF, TXT, MD, CSV, JSON, תמונות, וכו'.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "נתיב הקובץ לשליחה (יחסי לתיקיית files, למשל: apple-health-shortcut.md)",
        },
        contact_name: {
          type: "string",
          description: `שם איש הקשר לשליחה. השתמש ב-'owner' או '${config.ownerName}' לשליחה לבעלים.`,
        },
        caption: {
          type: "string",
          description: "כיתוב אופציונלי שיוצג עם הקובץ",
        },
      },
      required: ["file_path", "contact_name"],
    },
  },
];
