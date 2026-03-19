/**
 * Group message classifier.
 * Pre-filters group messages to avoid calling AI for irrelevant chatter.
 * The AI still has its own [SKIP] logic as a secondary filter.
 */

export interface GroupClassification {
  shouldRespond: boolean;
  isDirect: boolean;
  confidence: number;
}

// Bot name patterns (case-insensitive)
// Note: \b doesn't work with Hebrew characters, so we use (^|\s) and ($|\s|[?.!,])
const NAME_PATTERNS = [
  /(^|\s)לימור($|\s|[?.!,])/i,
  /\blimor\b/i,
  /(^|\s)לי?מורי($|\s|[?.!,])/i, // diminutive
];

// Command intent patterns
const COMMAND_PATTERNS = [
  /^\//, // slash commands
  /\bקבעי?\b/i, // "schedule"
  /\bתזמיני?\b/i, // "book"
  /\bחפשי?\b/i, // "search"
  /\bתבדקי?\b/i, // "check"
  /\bתשלחי?\b/i, // "send"
  /\bתראי?\b/i, // "show"
];

// Direct question indicators
const QUESTION_PATTERNS = [
  /\?/, // question mark
  /^(מה|מי|איפה|מתי|למה|איך|כמה|האם|אילו)\s/i, // Hebrew question words at start
];

/**
 * Classify whether the bot should respond to a group message.
 * Returns decision with confidence score (0-1).
 */
export function classifyGroupMessage(
  body: string,
  contactName: string
): GroupClassification {
  const trimmed = body.trim();

  // Always respond to slash commands
  if (trimmed.startsWith("/")) {
    return { shouldRespond: true, isDirect: true, confidence: 1.0 };
  }

  // Check for direct name mention
  for (const pattern of NAME_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { shouldRespond: true, isDirect: true, confidence: 0.95 };
    }
  }

  // Check for command intent directed at bot
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Command patterns alone aren't enough — could be directed at someone else
      // Only respond if the message is short (likely a command, not a conversation)
      if (trimmed.length < 50) {
        return { shouldRespond: true, isDirect: false, confidence: 0.6 };
      }
    }
  }

  // Check for direct questions (short messages with question indicators)
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(trimmed) && trimmed.length < 80) {
      return { shouldRespond: true, isDirect: false, confidence: 0.5 };
    }
  }

  // Default: don't respond to group chatter
  return { shouldRespond: false, isDirect: false, confidence: 0.9 };
}
