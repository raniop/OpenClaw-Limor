import { webSearch } from "../../web-search";
import type { ToolHandler } from "./types";

export const webSearchHandlers: Record<string, ToolHandler> = {
  web_search: async (input) => {
    const results = await webSearch(input.query, input.language || "he");
    if (results.length === 0) return `לא נמצאו תוצאות עבור "${input.query}".`;
    const lines = results.map(
      (r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}`
    );
    return `🔍 תוצאות חיפוש "${input.query}":\n\n${lines.join("\n\n")}`;
  },
};
