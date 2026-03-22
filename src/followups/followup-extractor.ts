/**
 * Extract follow-up commitments from messages.
 * Scans BOTH user message and AI response for follow-up patterns.
 */
import type { FollowupEntry } from "./followup-types";
import { addFollowup } from "./followup-store";

interface FollowupPattern {
  regex: RegExp;
  reason: string;
  dueOffsetHours: number;
}

// Patterns found in AI responses (commitments Limor made)
const RESPONSE_PATTERNS: FollowupPattern[] = [
  { regex: /נדבר מחר/i, reason: "נדבר מחר", dueOffsetHours: 24 },
  { regex: /אחזור אלי[יך]ך?/i, reason: "אחזור אליך", dueOffsetHours: 24 },
  { regex: /צריך לבדוק/i, reason: "צריך לבדוק", dueOffsetHours: 12 },
  { regex: /אבדוק ואחזור/i, reason: "אבדוק ואחזור", dueOffsetHours: 12 },
  { regex: /נחזור לזה/i, reason: "נחזור לזה", dueOffsetHours: 24 },
  { regex: /בהמשך היום/i, reason: "המשך היום", dueOffsetHours: 6 },
  { regex: /בשבוע הבא/i, reason: "שבוע הבא", dueOffsetHours: 168 },
  { regex: /אעדכן אותך/i, reason: "עדכון", dueOffsetHours: 24 },
  // Additional patterns — promises, scheduling, pending actions
  { regex: /אשלח ל[כך]/i, reason: "אשלח לך", dueOffsetHours: 24 },
  { regex: /אעביר ל[כך]/i, reason: "אעביר לך", dueOffsetHours: 24 },
  { regex: /אטפל בזה/i, reason: "אטפל בזה", dueOffsetHours: 12 },
  { regex: /אסדר את זה/i, reason: "אסדר את זה", dueOffsetHours: 12 },
  { regex: /אני בודק/i, reason: "בודק ומחזיר תשובה", dueOffsetHours: 12 },
  { regex: /אני בודקת/i, reason: "בודקת ומחזירה תשובה", dueOffsetHours: 12 },
  { regex: /אחזור עם תשובה/i, reason: "אחזור עם תשובה", dueOffsetHours: 24 },
  { regex: /נתאם מועד/i, reason: "תיאום מועד", dueOffsetHours: 48 },
  { regex: /אתאם איתך/i, reason: "תיאום", dueOffsetHours: 24 },
  { regex: /ממתינ[הים] לתשובה/i, reason: "ממתין לתשובה", dueOffsetHours: 48 },
  { regex: /ממתינ[הים] ל/i, reason: "ממתין", dueOffsetHours: 48 },
  { regex: /מחכ[הים] לאישור/i, reason: "מחכה לאישור", dueOffsetHours: 48 },
  { regex: /נקבע (שיחה|פגישה)/i, reason: "נקבע שיחה/פגישה", dueOffsetHours: 48 },
  { regex: /אברר ואחזור/i, reason: "אברר ואחזור", dueOffsetHours: 12 },
  { regex: /אני מבררת?/i, reason: "בירור ותשובה", dueOffsetHours: 12 },
  { regex: /אדאג ל/i, reason: "אדאג לטפל", dueOffsetHours: 24 },
  { regex: /אני מטפלת? בזה/i, reason: "מטפל בנושא", dueOffsetHours: 12 },
  { regex: /חסר פרט/i, reason: "חסר פרט — לחזור למשתמש", dueOffsetHours: 24 },
  { regex: /חסרים פרטים/i, reason: "חסרים פרטים — לחזור למשתמש", dueOffsetHours: 24 },
  { regex: /ברגע שיהיה/i, reason: "ממתין למידע ואז לחזור", dueOffsetHours: 48 },
  { regex: /אעקוב/i, reason: "מעקב", dueOffsetHours: 48 },
  { regex: /נדבר בהמשך/i, reason: "נדבר בהמשך", dueOffsetHours: 24 },
];

// Patterns found in user messages (requests/reminders from user)
const USER_PATTERNS: FollowupPattern[] = [
  { regex: /תזכיר(י)? לי/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /תזכר(י)? (אותי|לי)/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /אל תשכח(י)?/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /לזכור ש/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /להזכיר לי/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /remind me/i, reason: "reminder", dueOffsetHours: 24 },
  { regex: /תעקב(י)? אחרי/i, reason: "מעקב", dueOffsetHours: 48 },
  { regex: /תבדק(י)? מה קורה עם/i, reason: "לבדוק סטטוס", dueOffsetHours: 24 },
  { regex: /תחזר(י)? אלי/i, reason: "לחזור עם תשובה", dueOffsetHours: 24 },
  { regex: /don'?t forget/i, reason: "reminder", dueOffsetHours: 24 },
  { regex: /follow up/i, reason: "follow up", dueOffsetHours: 48 },
];

// Junk reasons that should never be saved as followups
const JUNK_REASONS = [
  "עדכון",
  "מעקב",
  "follow up",
  "לחזור למשתמש אם לא שלח את הפרט החסר",
];
const MIN_REASON_LENGTH = 5;

/**
 * Check if a reason is too short or matches known junk patterns.
 */
function isJunkReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) return true;
  // Check the base reason (before the " — " context suffix) against junk list
  const baseReason = trimmed.split(" — ")[0].trim();
  return JUNK_REASONS.some((junk) => baseReason === junk);
}

/**
 * Scan AI response and user message for follow-up patterns.
 * Returns created follow-up entries (empty array if none detected).
 */
export function extractFollowups(
  responseText: string,
  chatId: string,
  contactName: string,
  userMessage?: string
): FollowupEntry[] {
  // Skip [SKIP] and [REACT:...] responses
  if (responseText.startsWith("[SKIP]") || responseText.startsWith("[REACT:")) {
    return [];
  }

  const created: FollowupEntry[] = [];
  const now = new Date();

  // Check AI response for commitments
  for (const pattern of RESPONSE_PATTERNS) {
    if (pattern.regex.test(responseText)) {
      const dueAt = new Date(now.getTime() + pattern.dueOffsetHours * 60 * 60 * 1000);
      // Build a meaningful reason from user message context, not just the pattern name
      let reason = pattern.reason;
      if (userMessage && userMessage.length > 3) {
        const userContext = userMessage.substring(0, 80).replace(/\n/g, " ");
        reason = `${pattern.reason} — "${userContext}"`;
      }

      // Quality filter: skip junk or too-short reasons
      if (!isJunkReason(reason)) {
        const entry = addFollowup(chatId, contactName, reason, dueAt);
        created.push(entry);
      }
      break;
    }
  }

  // Check user message for reminder requests (only if no response pattern matched)
  if (created.length === 0 && userMessage) {
    for (const pattern of USER_PATTERNS) {
      if (pattern.regex.test(userMessage)) {
        const dueAt = new Date(now.getTime() + pattern.dueOffsetHours * 60 * 60 * 1000);
        // Use the full user message as the reason
        const reason = userMessage;

        // Quality filter: skip junk or too-short reasons
        if (!isJunkReason(reason)) {
          const entry = addFollowup(chatId, contactName, reason, dueAt);
          created.push(entry);
        }
        break;
      }
    }
  }

  return created;
}
