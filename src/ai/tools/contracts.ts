import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Contract & subscription tracking tools (owner-only) */
export const contractTools: Anthropic.Tool[] = [
  {
    name: "list_contracts",
    description: `הצגת כל החוזים והמנויים של ${config.ownerName}. השתמשי כש${config.ownerName} שואל 'מה המנויים שלי?', 'כמה אני משלם על אינטרנט?', 'מה החוזים שיש לי?', 'כמה אני משלם בחודש?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: [
            "internet", "electricity", "rent", "insurance", "water",
            "tax", "tv", "gas", "streaming", "phone", "pension", "vehicle", "other",
          ],
          description: "סינון לפי קטגוריה (אופציונלי)",
        },
        status: {
          type: "string",
          enum: ["active", "expiring_soon", "expired", "cancelled"],
          description: "סינון לפי סטטוס (אופציונלי)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_contract",
    description: `הוספת חוזה או מנוי ידנית. השתמשי רק כש${config.ownerName} מבקש להוסיף חוזה חדש בטקסט. ⚠️ אם הודעה מכילה [✅ חוזה נשמר אוטומטית] אל תשתמשי בכלי הזה — החוזה כבר נשמר!`,
    input_schema: {
      type: "object" as const,
      properties: {
        vendor: { type: "string", description: "שם הספק (למשל: HOT, נטפליקס, חברת החשמל)" },
        category: {
          type: "string",
          enum: [
            "internet", "electricity", "rent", "insurance", "water",
            "tax", "tv", "gas", "streaming", "phone", "pension", "vehicle", "other",
          ],
          description: "קטגוריה",
        },
        amount: { type: "number", description: "סכום (אופציונלי)" },
        currency: {
          type: "string",
          enum: ["ILS", "USD", "EUR"],
          description: "מטבע (ברירת מחדל: ILS)",
        },
        billingCycle: {
          type: "string",
          enum: ["monthly", "bimonthly", "quarterly", "yearly"],
          description: "מחזור חיוב (ברירת מחדל: monthly)",
        },
        renewalDate: { type: "string", description: "תאריך חידוש YYYY-MM-DD (אופציונלי)" },
        endDate: { type: "string", description: "תאריך סיום YYYY-MM-DD (אופציונלי)" },
        autoRenew: { type: "boolean", description: "חידוש אוטומטי (ברירת מחדל: true)" },
        notes: { type: "string", description: "הערות (אופציונלי)" },
      },
      required: ["vendor", "category"],
    },
  },
  {
    name: "update_contract",
    description: `עדכון פרטי חוזה או מנוי קיים. השתמשי כש${config.ownerName} אומר 'תעדכני את המנוי של...', 'שיניתי חבילה ב...', 'המחיר השתנה ל...'`,
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "מזהה החוזה" },
        vendor: { type: "string", description: "שם ספק חדש" },
        category: {
          type: "string",
          enum: [
            "internet", "electricity", "rent", "insurance", "water",
            "tax", "tv", "gas", "streaming", "phone", "pension", "vehicle", "other",
          ],
        },
        amount: { type: "number", description: "סכום חדש" },
        billingCycle: {
          type: "string",
          enum: ["monthly", "bimonthly", "quarterly", "yearly"],
        },
        renewalDate: { type: "string", description: "תאריך חידוש חדש YYYY-MM-DD" },
        endDate: { type: "string", description: "תאריך סיום YYYY-MM-DD" },
        autoRenew: { type: "boolean" },
        status: {
          type: "string",
          enum: ["active", "cancelled"],
          description: "סטטוס — cancelled לביטול מנוי",
        },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "check_renewals",
    description: `בדיקת חוזים שמתקרבים לחידוש או סיום. השתמשי כש${config.ownerName} שואל 'מה מתחדש בקרוב?', 'יש חוזים שפגים?', 'מתי צריך לחדש?'`,
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "כמה ימים קדימה לבדוק (ברירת מחדל: 30)",
        },
      },
      required: [],
    },
  },
];
