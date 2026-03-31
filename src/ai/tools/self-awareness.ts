import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Self-awareness tools — lets Limor introspect her own performance */
export const selfAwarenessTools: Anthropic.Tool[] = [
  {
    name: "get_my_status",
    description: `בדיקת סטטוס ומדדי ביצועים של ${config.botName} — דיוק כלים, שיעור הזיות, השלמת משימות, התראות אחרונות. השתמשי כש${config.ownerName} שואל "איך את עובדת?", "מה הסטטוס שלך?", "מה המדדים?", "יש בעיות?", או כשאת רוצה לבדוק את עצמך.`,
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          description: "תקופה לבדיקה: last_24h | last_7d | all (ברירת מחדל: last_24h)",
        },
      },
      required: [],
    },
  },
];
