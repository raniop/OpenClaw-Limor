import Anthropic from "@anthropic-ai/sdk";

/** Apple Health tools (owner-only) */
export const healthTools: Anthropic.Tool[] = [
  {
    name: "get_health_data",
    description: `שליפת נתוני Apple Health של רני — צעדים, קלוריות שרופות, פעילות גופנית.
נתונים מגיעים מאייפון רני דרך Shortcut אוטומטי.
השתמשי בזה כשרני שואל על הצעדים שלו, הקלוריות שצרף/שרף, הפעילות, או כשאת צריכה לחשב יתרת קלוריות יומית.
יעד קלורי יומי של רני: 1,800 קל'. משקל נוכחי: 83 ק"ג, יעד: 78 ק"ג.`,
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "תאריך בפורמט YYYY-MM-DD. אם לא צוין — מחזיר היום. לשבוע אחרון: 'last_7_days'",
        },
      },
      required: [],
    },
  },
];
