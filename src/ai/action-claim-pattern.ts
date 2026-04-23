/**
 * Hallucination detection regex — built dynamically from the owner's name.
 *
 * The assistant is considered to be hallucinating when its text claims an action
 * like "I sent the request", "I forwarded to [owner]", etc., but no tool was
 * actually invoked. Previously these patterns were hardcoded to "רני"; now they
 * incorporate the configured owner name so the detection works for any install.
 */
import { config } from "../config";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(withExtras: boolean): RegExp {
  const owner = escapeRegex(config.ownerName || "רני");
  const alternatives = [
    "שולחת בקשה",
    "שלחתי בקשה",
    `שולחת ל${owner}`,
    `העברתי ל${owner}`,
    "קבעתי",
    "שלחתי זימון",
    "שולחת זימון",
    "שלחתי הודעה",
    "שלחתי ל",
    "העברתי ל",
    "בדקתי את",
    "מצאתי (מסעדה|טיסה|מלון)",
    "הזמנתי",
    "ביטלתי",
    "יצרתי",
    "נוצרה",
    "הוספתי",
    "מחקתי",
  ];
  if (withExtras) {
    alternatives.push(
      "החלפתי",
      "עברתי ל",
      "שיניתי",
      "עדכנתי",
      "בוצע",
      "הופעל",
      "הוגדר",
      "נשמר",
      "הועבר",
    );
  }
  return new RegExp(alternatives.join("|"));
}

/** Basic action-claim pattern (used by self-check and whatsapp trace). */
export const ACTION_CLAIM_PATTERN = buildPattern(false);

/** Extended pattern used by the hallucination guard (includes mutation verbs). */
export const HALLUCINATION_PATTERN = buildPattern(true);
