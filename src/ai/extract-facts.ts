/**
 * Fact extraction from conversation history.
 * Uses a cheap model (Sonnet) to extract 0-2 permanent facts per conversation.
 * Extracted from ai-core.ts — exact same logic, no behavior changes.
 */
import { client } from "./client";
import type { Message } from "./types";
import { log } from "../logger";

const EXTRACT_PROMPT = `אתה מנתח שיחות. תפקידך לחלץ מידע חשוב ו**קבוע** מהשיחה שצריך לזכור לטווח ארוך.

החזר JSON בלבד בפורמט הזה (בלי markdown, בלי backticks):
{"name": "שם המשתמש אם נאמר, או null", "facts": ["עובדה 1", "עובדה 2"]}

מה כן לשמור:
- עובדות אישיות קבועות (שם, עבודה, תחביבים, העדפות, משפחה, מיקום)
- תזכורות עתידיות שהמשתמש ביקש

מה לא לשמור:
- פעולות זמניות ("לימור מחכה לתשובה", "לימור שלחה הודעה") - אלה לא עובדות לזכור
- בקשות חד-פעמיות שכבר טופלו ("ביקש לחפש מסעדה", "שאל על פוליסה")
- מידע על מה שלימור עשתה או לא עשתה
- מידע שהמשתמש רק שאל עליו (שאלות זה לא עובדות)
- דברים כלליים וברורים מאליהם

כלל חשוב: שמור רק 0-2 עובדות מכל שיחה. רוב השיחות לא מכילות מידע חדש לזכור.
אם אין מידע חדש, החזר: {"name": null, "facts": []}
כתוב בצורה קצרה וברורה בעברית`;

export async function extractFacts(
  history: Message[]
): Promise<{ name: string | null; facts: string[] }> {
  try {
    const lastMessages = history.slice(-4);
    const conversation = lastMessages
      .map((m) => `${m.role === "user" ? "משתמש" : "לימור"}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514", // Keep cheap model for fact extraction
      max_tokens: 256,
      system: EXTRACT_PROMPT,
      messages: [{ role: "user", content: conversation }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(text);
    return {
      name: parsed.name || null,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    };
  } catch (error) {
    log.memoryExtractFailed(String(error));
    return { name: null, facts: [] };
  }
}
