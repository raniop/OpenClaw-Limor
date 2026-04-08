import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Operational rule management tools (owner-only) */
export const operationalRuleTools: Anthropic.Tool[] = [
  {
    name: "save_operational_rule",
    description:
      `שמירת כלל תפעולי שישפיע על ההתנהגות האוטומטית של המערכת. השתמשי כש${config.ownerName} מבקש לשנות התנהגות של מערכת אוטומטית:
- העברת מיילים/קבלות: subsystem="email" (vendor, emailType)
- העברת SMS: subsystem="sms" (sender)
- התראות משלוחים: subsystem="delivery" (vendor)
- הודעות פרואקטיביות (סיכום בוקר, תזכורות): subsystem="proactive" (proactiveType)
- סוכנים אוטונומיים: subsystem="agents" (agentId)
- כל המערכות: subsystem="*"
דוגמאות: "אל תעבירי קבלות של אפל", "תשתיקי SMS מהראל להיום", "תפסיקי עם הסיכום בוקר", "עמית לא צריך לרוץ השבוע"
⚠️ זה שונה מ-learn_instruction! learn_instruction = איך לדבר/להגיב. save_operational_rule = מה לעשות/לא לעשות אוטומטית.`,
    input_schema: {
      type: "object" as const,
      properties: {
        subsystem: {
          type: "string",
          enum: ["email", "sms", "delivery", "proactive", "agents", "*"],
          description: "איזו מערכת אוטומטית מושפעת",
        },
        action: {
          type: "string",
          enum: ["block", "allow", "mute"],
          description: "block=חסום לגמרי, allow=אפשר (עוקף חסימה קיימת), mute=השתק זמנית",
        },
        conditions: {
          type: "object",
          description: "תנאים לסינון (AND logic — כל התנאים חייבים להתקיים)",
          properties: {
            vendor: {
              type: "string",
              description: "שם ספק: Apple, Amazon, Wolt, AliExpress וכו׳",
            },
            sender: {
              type: "string",
              description: "שולח SMS: HAREL, OPHIR וכו׳",
            },
            emailType: {
              type: "string",
              enum: ["receipt", "order", "flight", "hotel", "booking", "subscription"],
              description: "סוג מייל",
            },
            proactiveType: {
              type: "string",
              enum: ["morning_summary", "followup_reminder", "pre_meeting"],
              description: "סוג הודעה פרואקטיבית",
            },
            agentId: {
              type: "string",
              description: "מזהה סוכן: amit, boris, michal",
            },
            keyword: {
              type: "string",
              description: "מילת מפתח לסינון לפי תוכן ההודעה",
            },
          },
        },
        description: {
          type: "string",
          description: "תיאור קצר בעברית של מה הכלל עושה",
        },
        duration: {
          type: "string",
          enum: ["permanent", "today", "this_week", "1h", "3h", "12h", "24h"],
          description: "permanent=לצמיתות, today=עד סוף היום, this_week=עד סוף השבוע, או משך זמן",
        },
      },
      required: ["subsystem", "action", "description"],
    },
  },
  {
    name: "remove_operational_rule",
    description: `הסרת כלל תפעולי. אפשר לפי מספר סידורי, מזהה כלל, או חיפוש טקסט בתיאור.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "מספר כלל, מזהה, או טקסט לחיפוש",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_operational_rules",
    description: `הצגת כל הכללים התפעוליים הפעילים. אפשר לסנן לפי מערכת.`,
    input_schema: {
      type: "object" as const,
      properties: {
        subsystem: {
          type: "string",
          enum: ["email", "sms", "delivery", "proactive", "agents"],
          description: "סנן לפי מערכת (אופציונלי — ריק = הכל)",
        },
      },
      required: [],
    },
  },
];
