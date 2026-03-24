import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Contact management tools (owner-only) */
export const contactTools: Anthropic.Tool[] = [
  {
    name: "add_contact",
    description: `הוספת איש קשר חדש למערכת ולדשבורד. **חובה** להשתמש בכלי הזה כש${config.ownerName} מבקש להוסיף איש קשר, שולח כרטיס איש קשר, או מזכיר שם + מספר טלפון של מישהו חדש. לא מספיק לזכור — חייבים לקרוא לכלי!`,
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם איש הקשר" },
        phone: { type: "string", description: "מספר טלפון" },
      },
      required: ["name", "phone"],
    },
  },
  {
    name: "list_contacts",
    description: "הצגת כל אנשי הקשר השמורים",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "delete_contact",
    description: `מחיקת איש קשר מהמערכת לחלוטין. השתמשי כש${config.ownerName} מבקש למחוק/להסיר איש קשר.`,
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: {
          type: "string",
          description: "שם איש הקשר למחיקה",
        },
      },
      required: ["contact_name"],
    },
  },
  {
    name: "block_contact",
    description: `חסימת איש קשר - הוא לא יוכל לדבר עם ${config.botName} יותר (עד ש${config.ownerName} יאשר מחדש)`,
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: {
          type: "string",
          description: "שם איש הקשר לחסימה",
        },
      },
      required: ["contact_name"],
    },
  },
  {
    name: "get_contact_history",
    description: `צפייה בהיסטוריית השיחה עם איש קשר. השתמשי כש${config.ownerName} שואל 'מה X כתב/רצה/אמר לך?' או 'מה דיברת עם X?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: {
          type: "string",
          description: "שם איש הקשר",
        },
        last_n: {
          type: "number",
          description: "כמה הודעות אחרונות להחזיר (ברירת מחדל: 10)",
        },
      },
      required: ["contact_name"],
    },
  },
  {
    name: "get_group_history",
    description: `צפייה בהיסטוריית שיחה של קבוצת וואטסאפ. השתמשי כש${config.ownerName} שואל 'מה היה בקבוצה X?' או 'תסכמי לי את הקבוצה'.`,
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה (או חלק ממנו)",
        },
        last_n: {
          type: "number",
          description: "כמה הודעות אחרונות להחזיר (ברירת מחדל: 20)",
        },
      },
      required: ["group_name"],
    },
  },
  {
    name: "summarize_group_activity",
    description: `סיכום פעילות בקבוצת וואטסאפ — מה קרה, מי הזכיר את ${config.ownerName}, מה צריך תשומת לב. השתמשי כש${config.ownerName} שואל 'מה קרה בקבוצה X?' או 'תסכמי לי את הקבוצה'.`,
    input_schema: {
      type: "object" as const,
      properties: {
        group_name: {
          type: "string",
          description: "שם הקבוצה (או חלק ממנו)",
        },
        since_hours: {
          type: "number",
          description: "כמה שעות אחורה לסכם (ברירת מחדל: 24)",
        },
      },
      required: ["group_name"],
    },
  },
  {
    name: "create_reminder",
    description: `יצירת תזכורת/מעקב. השתמשי כשמישהו מבקש לתזכר את ${config.ownerName}, או כש${config.ownerName} מבקש תזכורת, או כשיש משימה שצריך לעקוב אחריה. חובה לציין מי ביקש (from_name) ומה בדיוק הבקשה (task).`,
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "תיאור מלא של המשימה/תזכורת. למשל: 'לקנות כבל HDMI לאלי' או 'להתקשר לליאור'",
        },
        from_name: {
          type: "string",
          description: "מי ביקש את התזכורת — שם האדם שממנו הגיעה הבקשה. למשל: 'רני', 'אלי אופיר', 'עמית'",
        },
        due_hours: {
          type: "number",
          description: "בעוד כמה שעות להזכיר (ברירת מחדל: 24)",
        },
      },
      required: ["task", "from_name"],
    },
  },
];
