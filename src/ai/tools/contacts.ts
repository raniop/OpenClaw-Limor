import Anthropic from "@anthropic-ai/sdk";

/** Contact management tools (owner-only) */
export const contactTools: Anthropic.Tool[] = [
  {
    name: "add_contact",
    description: "הוספת איש קשר חדש. השתמשי כשרני מלמד אותך על אנשי קשר חדשים.",
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
    name: "block_contact",
    description: "חסימת איש קשר - הוא לא יוכל לדבר עם לימור יותר (עד שרני יאשר מחדש)",
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
    description: "צפייה בהיסטוריית השיחה עם איש קשר. השתמשי כשרני שואל 'מה X כתב/רצה/אמר לך?' או 'מה דיברת עם X?'",
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
    description: "צפייה בהיסטוריית שיחה של קבוצת וואטסאפ. השתמשי כשרני שואל 'מה היה בקבוצה X?' או 'תסכמי לי את הקבוצה'.",
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
];
