/**
 * Correction Learner — extracts behavioral rules from user corrections.
 * When a user corrects Limor, this module extracts what went wrong
 * and saves it as an instruction to prevent the same mistake.
 * Uses Sonnet for cheap extraction.
 */
import { client } from "../ai/client";
import { SONNET } from "../ai/model-router";
import { config } from "../config";
import { saveInstruction } from "../instructions";

const CORRECTION_PROMPT = `אתה מנתח תיקונים. המשתמש תיקן את ${config.botName} (העוזרת האישית).
תפקידך: לחלץ כלל התנהגותי ש${config.botName} צריכה לזכור כדי לא לחזור על הטעות.

החזר JSON בלבד (בלי markdown, בלי backticks):
{"rule": "הכלל בעברית, קצר וברור", "relevant": true}

אם התיקון הוא חד-פעמי ולא רלוונטי לעתיד (למשל "לא, הקובץ הזה"), החזר:
{"rule": "", "relevant": false}

דוגמאות לכללים טובים:
- "כשמחפשים מסעדה, תמיד לשאול כמה סועדים לפני שמחפשים"
- "לא לשלוח הודעות לאנשי קשר בלי לשאול קודם"
- "כש${config.ownerName} אומר 'תזכירי לי' הוא מתכוון ליצור תזכורת ביומן"
- "להשתמש בעברית תמיד כשמדברים עם ${config.ownerName}"

כתוב כלל קצר וספציפי שאפשר ליישם.`;

/**
 * Analyze a correction and extract a behavioral rule.
 * Runs in background after detecting a correction turn intent.
 */
export async function learnFromCorrection(
  userCorrectionMessage: string,
  lastAssistantMessage: string
): Promise<void> {
  try {
    const conversation = [
      `${config.botName} אמרה: ${lastAssistantMessage}`,
      `המשתמש תיקן: ${userCorrectionMessage}`,
    ].join("\n");

    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 256,
      system: CORRECTION_PROMPT,
      messages: [{ role: "user", content: conversation }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(text);

    if (parsed.relevant && parsed.rule && parsed.rule.length > 5) {
      saveInstruction(`[למדתי מתיקון] ${parsed.rule}`);
      console.log(`[correction-learner] Saved rule: ${parsed.rule}`);
    } else {
      console.log("[correction-learner] No persistent rule extracted (one-time correction)");
    }
  } catch (error) {
    console.error("[correction-learner] Failed to extract rule:", error);
  }
}
