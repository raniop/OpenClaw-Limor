import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";

/** Model switching tool (owner-only) */
export const modelTools: Anthropic.Tool[] = [
  {
    name: "switch_model",
    description: `החלפת המודל של ${config.botName}. אפשר לעבור בין Sonnet (מהיר וזול) ל-Opus (חכם יותר, איטי יותר). השתמשי כש${config.ownerName} מבקש לעבור מודל.`,
    input_schema: {
      type: "object" as const,
      properties: {
        model: {
          type: "string",
          description: "שם המודל: 'sonnet' או 'opus'",
        },
      },
      required: ["model"],
    },
  },
  {
    name: "get_current_model",
    description: `הצגת המודל הנוכחי של ${config.botName}`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
