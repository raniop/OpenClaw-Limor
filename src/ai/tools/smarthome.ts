import Anthropic from "@anthropic-ai/sdk";

/** Smart home (Control4) tools (owner-only) */
export const smartHomeTools: Anthropic.Tool[] = [
  {
    name: "smart_home_control",
    description:
      "שליטה במכשיר בבית החכם (אורות, וילונות, מאווררים, דוד, מזגן). אפשר להדליק/לכבות אורות, לפתוח/לסגור וילונות, ועוד.",
    input_schema: {
      type: "object" as const,
      properties: {
        device_name: {
          type: "string",
          description: "שם המכשיר (למשל: 'Salon Ceiling', 'Strip Kitchen', 'Somfy TaHoma Blind 1', 'דוד חשמלי')",
        },
        action: {
          type: "string",
          description: "פעולה: 'on'/'הדלק' | 'off'/'כבה' | 'toggle' | 'open'/'פתח' | 'close'/'סגור' | 'stop'/'עצור'",
        },
        value: {
          type: "number",
          description: "ערך (אופציונלי) - למשל טמפרטורה למזגן או אחוז לוילון",
        },
      },
      required: ["device_name", "action"],
    },
  },
  {
    name: "smart_home_status",
    description: "בדיקת סטטוס של מכשיר בבית החכם (האם האור דלוק, מיקום וילון, טמפרטורה)",
    input_schema: {
      type: "object" as const,
      properties: {
        device_name: {
          type: "string",
          description: "שם המכשיר לבדיקה",
        },
      },
      required: ["device_name"],
    },
  },
  {
    name: "smart_home_list",
    description: "הצגת כל החדרים או המכשירים הנשלטים בבית החכם",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description: "'rooms' לחדרים, 'devices' למכשירים",
        },
      },
      required: ["type"],
    },
  },
];
