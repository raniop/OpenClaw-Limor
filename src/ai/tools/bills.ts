import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

export const billTools: Anthropic.Tool[] = [
  {
    name: "list_bills",
    description: `הצגת חשבוניות ותשלומים של ${config.ownerName}. השתמשי כש${config.ownerName} שואל 'מה החשבונות שלי?', 'כמה יש לשלם?', 'מה החשבון חשמל?', 'איזה חשבוניות יש?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["electricity", "water", "tax", "gas", "phone", "internet", "insurance", "rent", "other"],
          description: "סינון לפי קטגוריה (אופציונלי)",
        },
        status: {
          type: "string",
          enum: ["unpaid", "paid", "overdue"],
          description: "סינון לפי סטטוס (אופציונלי)",
        },
        vendor: {
          type: "string",
          description: "סינון לפי ספק (אופציונלי)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_bill",
    description: `הוספת חשבונית/חשבון ידנית. השתמשי רק כש${config.ownerName} מבקש להוסיף חשבון חדש בטקסט (למשל 'קיבלתי חשבון חשמל של 450 שקל'). ⚠️ אם הודעה מכילה [✅ חשבון נשמר אוטומטית] אל תשתמשי בכלי הזה — החשבון כבר נשמר!`,
    input_schema: {
      type: "object" as const,
      properties: {
        vendor: { type: "string", description: "שם הספק" },
        category: {
          type: "string",
          enum: ["electricity", "water", "tax", "gas", "phone", "internet", "insurance", "rent", "other"],
        },
        amount: { type: "number", description: "סכום" },
        currency: { type: "string", enum: ["ILS", "USD", "EUR"], description: "מטבע (ברירת מחדל: ILS)" },
        invoiceNumber: { type: "string", description: "מספר חשבונית (אופציונלי)" },
        periodStart: { type: "string", description: "תחילת תקופה YYYY-MM-DD" },
        periodEnd: { type: "string", description: "סוף תקופה YYYY-MM-DD" },
        dueDate: { type: "string", description: "מועד תשלום אחרון YYYY-MM-DD" },
      },
      required: ["vendor", "category", "amount"],
    },
  },
  {
    name: "mark_bill_paid",
    description: `סימון חשבון כשולם. השתמשי כש${config.ownerName} אומר 'שילמתי את החשמל', 'החשבון מים שולם', 'שילמתי'`,
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "מזהה החשבון" },
        vendor: { type: "string", description: "שם ספק (אם אין ID)" },
      },
      required: [],
    },
  },
  {
    name: "check_unpaid_bills",
    description: `בדיקת חשבונות שלא שולמו. השתמשי כש${config.ownerName} שואל 'מה עוד לא שילמתי?', 'יש חשבונות פתוחים?', 'מה באיחור?'`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
