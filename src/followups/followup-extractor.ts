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
];

// Patterns found in user messages (requests/reminders from user)
const USER_PATTERNS: FollowupPattern[] = [
  { regex: /תזכיר(י)? לי/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /תזכר(י)? (אותי|לי)/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /אל תשכח(י)?/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /לזכור ש/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /להזכיר לי/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /remind me/i, reason: "reminder", dueOffsetHours: 24 },
];

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
      const entry = addFollowup(chatId, contactName, pattern.reason, dueAt);
      created.push(entry);
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
        const entry = addFollowup(chatId, contactName, reason, dueAt);
        created.push(entry);
        break;
      }
    }
  }

  return created;
}
