import Anthropic from "@anthropic-ai/sdk";

/** Web search tool — searches the internet and returns results */
export const webSearchTools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "חיפוש באינטרנט — מחזיר תוצאות חיפוש עדכניות. השתמשי כשצריך מידע עדכני מהאינטרנט, למשל: חדשות, מזג אוויר, מחירים, מידע על עסקים, וכו׳.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "שאילתת החיפוש",
        },
        language: {
          type: "string",
          description: "שפת החיפוש (ברירת מחדל: he)",
        },
      },
      required: ["query"],
    },
  },
];
