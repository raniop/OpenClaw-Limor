import Anthropic from "@anthropic-ai/sdk";

/** CRM tools (owner-only) */
export const crmTools: Anthropic.Tool[] = [
  {
    name: "crm_search_policy",
    description: "חיפוש פוליסות ב-CRM לפי תעודת זהות של לקוח",
    input_schema: {
      type: "object" as const,
      properties: {
        person_id: {
          type: "string",
          description: "תעודת זהות של הלקוח (9 ספרות)",
        },
      },
      required: ["person_id"],
    },
  },
  {
    name: "crm_policy_details",
    description: "קבלת פרטים מלאים על פוליסה ספציפית לפי מזהה פוליסה",
    input_schema: {
      type: "object" as const,
      properties: {
        policy_index: {
          type: "number",
          description: "מזהה/אינדקס הפוליסה",
        },
      },
      required: ["policy_index"],
    },
  },
  {
    name: "crm_policy_customers",
    description: "קבלת פרטי לקוחות של פוליסה ספציפית",
    input_schema: {
      type: "object" as const,
      properties: {
        policy_index: {
          type: "number",
          description: "מזהה/אינדקס הפוליסה",
        },
      },
      required: ["policy_index"],
    },
  },
  {
    name: "crm_dashboard",
    description: "נתוני דשבורד כלליים או לפי חודש ושנה ספציפיים",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "number",
          description: "חודש (1-12). אופציונלי – אם לא צוין, מחזיר דשבורד כללי",
        },
        year: {
          type: "number",
          description: "שנה (למשל 2026). אופציונלי",
        },
      },
      required: [],
    },
  },
  {
    name: "crm_top_policies",
    description: "רשימת הפוליסות המובילות",
    input_schema: {
      type: "object" as const,
      properties: {
        top: {
          type: "number",
          description: "כמה פוליסות להחזיר (ברירת מחדל: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "crm_agents_report",
    description: "דוח סוכנים - נתוני ביצועים של סוכנים",
    input_schema: {
      type: "object" as const,
      properties: {
        page: { type: "number", description: "מספר עמוד (ברירת מחדל: 1)" },
        page_size: { type: "number", description: "גודל עמוד (ברירת מחדל: 50)" },
      },
      required: [],
    },
  },
  {
    name: "crm_send_sms",
    description: "שליחת הודעת SMS ללקוח דרך ה-CRM",
    input_schema: {
      type: "object" as const,
      properties: {
        mobile: {
          type: "string",
          description: "מספר טלפון של הנמען",
        },
        message: {
          type: "string",
          description: "תוכן ההודעה",
        },
      },
      required: ["mobile", "message"],
    },
  },
];
