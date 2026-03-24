import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** SMS reading + delivery tracking tools (owner-only) */
export const smsTools: Anthropic.Tool[] = [
  {
    name: "read_sms",
    description: `קריאת הודעות SMS/iMessage אחרונות מהאייפון של ${config.ownerName}. השתמשי כש${config.ownerName} שואל 'מה קיבלתי ב-SMS?', 'יש הודעות חדשות?', 'מה הגיע בהודעות?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        hours: {
          type: "number",
          description: "כמה שעות אחורה לחפש (ברירת מחדל: 24)",
        },
        limit: {
          type: "number",
          description: "כמה הודעות להחזיר (ברירת מחדל: 15)",
        },
        sms_only: {
          type: "boolean",
          description: "רק SMS (לא iMessage). ברירת מחדל: false",
        },
      },
      required: [],
    },
  },
  {
    name: "search_sms",
    description: `חיפוש בהודעות SMS/iMessage לפי מילת מפתח. השתמשי כש${config.ownerName} מחפש הודעה מסוימת.`,
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "מילת חיפוש",
        },
        limit: {
          type: "number",
          description: "כמה תוצאות (ברירת מחדל: 10)",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "check_deliveries",
    description: `בדיקת הודעות SMS על חבילות ומשלוחים. השתמשי כש${config.ownerName} שואל 'יש חבילות?', 'מה עם המשלוח?', 'הגיע משהו?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        hours: {
          type: "number",
          description: "כמה שעות אחורה לחפש (ברירת מחדל: 168 = שבוע)",
        },
      },
      required: [],
    },
  },
  {
    name: "mark_delivery_received",
    description: `סימון משלוח/חבילה כנמסר. השתמשי כש${config.ownerName} אומר 'קיבלתי את החבילה', 'המשלוח הגיע', 'החבילה מפדקס הגיעה', 'קיבלתי את זה'. חפשי לפי שם חברת שליחות, מספר מעקב, או תיאור.`,
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "מילת חיפוש לזיהוי המשלוח — שם חברה (FedEx, דואר ישראל), מספר מעקב, או תיאור",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "list_pending_deliveries",
    description: `הצגת כל המשלוחים שעדיין לא נמסרו. השתמשי כש${config.ownerName} שואל 'מה עוד לא הגיע?', 'אילו חבילות ממתינות?'`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
