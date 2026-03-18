import Anthropic from "@anthropic-ai/sdk";

/** Owner instruction management tools (owner-only) */
export const instructionTools: Anthropic.Tool[] = [
  {
    name: "learn_instruction",
    description:
      "שמירת הוראה/כלל חדש שרני מלמד אותך. השתמשי כשרני אומר 'תזכרי ש...', 'מעכשיו...', 'כלל חדש:', או מלמד אותך התנהגות חדשה.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description: "ההוראה/כלל לזכור",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "forget_instruction",
    description: "מחיקת הוראה שרני לימד אותך. אפשר לפי מספר סידורי או חיפוש טקסט.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "מספר ההוראה או טקסט לחיפוש",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_instructions",
    description: "הצגת כל ההוראות שרני לימד אותך.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
