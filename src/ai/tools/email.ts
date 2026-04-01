import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Email reading + order tracking tools (owner-only) */
export const emailTools: Anthropic.Tool[] = [
  {
    name: "read_emails",
    description: `קריאת אימיילים אחרונים מתיבת הדואר של ${config.ownerName}. השתמשי כש${config.ownerName} שואל 'מה קיבלתי במייל?', 'יש מיילים חדשים?', 'מה הגיע במייל?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        hours: {
          type: "number",
          description: "כמה שעות אחורה לחפש (ברירת מחדל: 24)",
        },
        limit: {
          type: "number",
          description: "כמה אימיילים להחזיר (ברירת מחדל: 15)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_emails",
    description: `חיפוש באימיילים לפי מילת מפתח, שולח או תאריך. השתמשי כש${config.ownerName} מחפש מייל מסוים, כמו 'חפשי מייל מאמזון', 'יש מייל על הטיסה?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "מילת חיפוש (בנושא או בגוף המייל)",
        },
        from: {
          type: "string",
          description: "סינון לפי שולח (אופציונלי)",
        },
        days: {
          type: "number",
          description: "כמה ימים אחורה לחפש (ברירת מחדל: 30)",
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
    name: "check_email_orders",
    description: `בדיקת הזמנות, טיסות, מלונות וקבלות שזוהו מהמייל. השתמשי כש${config.ownerName} שואל 'יש הזמנות?', 'מתי הטיסה?', 'איזה מלון הזמנתי?', 'מה הזמנתי לאחרונה?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["package", "flight", "hotel", "receipt"],
          description: "סוג הזמנה לסינון (אופציונלי): package=חבילות, flight=טיסות, hotel=מלונות, receipt=קבלות",
        },
        days: {
          type: "number",
          description: "כמה ימים אחורה לחפש (ברירת מחדל: 30)",
        },
      },
      required: [],
    },
  },
];
