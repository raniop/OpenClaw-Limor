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
];
