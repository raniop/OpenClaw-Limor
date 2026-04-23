import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Apple Health tools (owner-only) */
export const healthTools: Anthropic.Tool[] = [
  {
    name: "get_health_data",
    description: `שליפת נתוני Apple Health של ${config.ownerName} — צעדים, קלוריות שרופות, פעילות גופנית.
נתונים מגיעים מהאייפון דרך Shortcut אוטומטי.
השתמשי בזה כש${config.ownerName} שואל על הצעדים, הקלוריות שצרך/שרף, הפעילות, או כשאת צריכה לחשב יתרת קלוריות יומית.`,
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
