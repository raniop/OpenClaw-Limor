/**
 * Extract follow-up commitments from AI response text.
 * Detects Hebrew patterns like "נדבר מחר", "אחזור אליך", "תזכיר לי", etc.
 */
import type { FollowupEntry } from "./followup-types";
import { addFollowup } from "./followup-store";

interface FollowupPattern {
  regex: RegExp;
  reason: string;
  dueOffsetHours: number;
}

const PATTERNS: FollowupPattern[] = [
  { regex: /נדבר מחר/i, reason: "נדבר מחר", dueOffsetHours: 24 },
  { regex: /אחזור אלי[יך]ך?/i, reason: "אחזור אליך", dueOffsetHours: 24 },
  { regex: /תזכיר(י)? לי/i, reason: "תזכורת", dueOffsetHours: 24 },
  { regex: /צריך לבדוק/i, reason: "צריך לבדוק", dueOffsetHours: 12 },
  { regex: /אבדוק ואחזור/i, reason: "אבדוק ואחזור", dueOffsetHours: 12 },
  { regex: /נחזור לזה/i, reason: "נחזור לזה", dueOffsetHours: 24 },
  { regex: /בהמשך היום/i, reason: "המשך היום", dueOffsetHours: 6 },
  { regex: /בשבוע הבא/i, reason: "שבוע הבא", dueOffsetHours: 168 },
  { regex: /אעדכן אותך/i, reason: "עדכון", dueOffsetHours: 24 },
];

/**
 * Scan AI response text for follow-up patterns and create entries.
 * Returns created follow-up entries (empty array if none detected).
 */
export function extractFollowups(
  responseText: string,
  chatId: string,
  contactName: string
): FollowupEntry[] {
  // Skip [SKIP] and [REACT:...] responses
  if (responseText.startsWith("[SKIP]") || responseText.startsWith("[REACT:")) {
    return [];
  }

  const created: FollowupEntry[] = [];
  const now = new Date();

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(responseText)) {
      const dueAt = new Date(now.getTime() + pattern.dueOffsetHours * 60 * 60 * 1000);
      const entry = addFollowup(chatId, contactName, pattern.reason, dueAt);
      created.push(entry);
      // Only extract the first matching pattern per message to avoid duplicates
      break;
    }
  }

  return created;
}
