import { config } from "../../config";
import { OPUS, SONNET } from "../model-router";
import type { ToolHandler } from "./types";

export const modelHandlers: Record<string, ToolHandler> = {
  switch_model: async (input) => {
    const MODEL_MAP: Record<string, string> = {
      sonnet: SONNET,
      opus: OPUS,
    };
    const target = input.model?.toLowerCase();
    const modelId = MODEL_MAP[target];
    if (!modelId) return `❌ מודל לא מוכר: "${input.model}". אפשרויות: sonnet, opus`;
    const previous = config.model;
    config.model = modelId;
    console.log(`[model] Switched from ${previous} to ${modelId}`);
    return `✅ עברתי ל-${target.charAt(0).toUpperCase() + target.slice(1)}! (${modelId})\nשים לב: זה חוזר ל-Sonnet אחרי restart.`;
  },

  get_current_model: async () => {
    const name_ = config.model.includes("opus") ? "Opus" : "Sonnet";
    return `המודל הנוכחי: **${name_}** (${config.model})`;
  },
};
