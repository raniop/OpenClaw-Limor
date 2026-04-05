/**
 * Fact extraction from conversation history.
 * Uses a cheap model (Sonnet) to extract 0-2 permanent facts per conversation.
 * Extracted from ai-core.ts — exact same logic, no behavior changes.
 */
import { client } from "./client";
import { SONNET } from "./model-router";
import { config } from "../config";
import type { Message } from "./types";
import { log } from "../logger";

const EXTRACT_PROMPT = `אתה מנתח שיחות. תפקידך לחלץ מידע חשוב ו**קבוע** מהשיחה שצריך לזכור לטווח ארוך.

החזר JSON בלבד בפורמט הזה (בלי markdown, בלי backticks):
{"name": "שם המשתמש אם נאמר, או null", "facts": ["עובדה 1", "עובדה 2"], "preferences": {"קטגוריה": ["ערך"]}}

מה כן לשמור ב-facts:
- עובדות אישיות קבועות (שם, עבודה, תחביבים, משפחה, מיקום)
- תזכורות עתידיות שהמשתמש ביקש

מה כן לשמור ב-preferences (העדפות):
- אוכל: סוגי מסעדות, מאכלים אהובים ("אוהב סושי", "צמחוני")
- זמנים: שעות מועדפות, ימים ("מעדיף ערבים", "פנוי בימי שישי")
- תקשורת: סגנון תקשורת ("מעדיף הודעות קצרות")
- מקומות: מסעדות/מקומות אהובים
- כללי: כל העדפה אחרת שנלמדה

מה לא לשמור:
- פעולות זמניות ("${config.botName} מחכה לתשובה", "${config.botName} שלחה הודעה")
- בקשות חד-פעמיות שכבר טופלו
- מידע על מה ש${config.botName} עשתה או לא עשתה
- דברים כלליים וברורים מאליהם

כלל חשוב: שמור רק 0-2 עובדות ו-0-2 העדפות מכל שיחה.
אם אין מידע חדש, החזר: {"name": null, "facts": [], "preferences": {}}
כתוב בצורה קצרה וברורה בעברית`;

export interface ExtractedData {
  name: string | null;
  facts: string[];
  preferences: Record<string, string[]>;
}

export async function extractFacts(
  history: Message[]
): Promise<ExtractedData> {
  try {
    const lastMessages = history.slice(-4);
    const conversation = lastMessages
      .map((m) => `${m.role === "user" ? "משתמש" : config.botName}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 256,
      system: [{ type: "text", text: EXTRACT_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: conversation }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(text);
    return {
      name: parsed.name || null,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      preferences: (typeof parsed.preferences === "object" && parsed.preferences !== null) ? parsed.preferences : {},
    };
  } catch (error) {
    log.memoryExtractFailed(String(error));
    return { name: null, facts: [], preferences: {} };
  }
}
