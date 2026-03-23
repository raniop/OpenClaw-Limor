/**
 * Group message classifier.
 * Pre-filters group messages to avoid calling AI for irrelevant chatter.
 * The AI still has its own [SKIP] logic as a secondary filter.
 * Tracks recent responses to detect conversation continuations.
 */

export interface GroupClassification {
  shouldRespond: boolean;
  isDirect: boolean;
  confidence: number;
}

// ─── Smart Pre-Filter ──────────────────────────────────────────────────────────

export interface GroupMessageContext {
  body: string;
  contactName: string;
  chatId: string;
  mentionedIds: string[];       // WhatsApp IDs from msg.mentionedIds
  hasQuotedMsg: boolean;
  quotedSenderName: string;     // who was the quoted message from
  quotedMsgFromMe: boolean;     // was the quoted message from Limor
  senderIsBot: boolean;         // is the sender a bot
  limorMentioned: boolean;      // does body mention Limor by name
  inOtherThread: boolean;       // is sender in thread without Limor
  limorWhatsAppId: string;      // Limor's own WhatsApp ID
}

export interface GroupFilterResult {
  verdict: "must_respond" | "must_skip" | "let_ai_decide";
  reason: string;
}

/** Detect if a contact name looks like a bot */
export function isBotContact(name: string): boolean {
  if (!name) return false;
  // Ends with "'s Ai", "Ai", "Bot" (case-insensitive)
  if (/(?:'s\s*)?Ai$/i.test(name.trim())) return true;
  if (/Bot$/i.test(name.trim())) return true;
  return false;
}

/**
 * Deterministic pre-filter for group messages.
 * Runs BEFORE AI call — saves API costs and prevents incorrect responses.
 */
export function filterGroupMessage(ctx: GroupMessageContext): GroupFilterResult {
  // ─── MUST_RESPOND (highest priority) ───────────────────────────────
  if (ctx.limorMentioned) {
    return { verdict: "must_respond", reason: "limor_mentioned_by_name" };
  }
  if (ctx.hasQuotedMsg && ctx.quotedMsgFromMe) {
    return { verdict: "must_respond", reason: "reply_to_limor" };
  }
  if (ctx.body.trim().startsWith("/")) {
    return { verdict: "must_respond", reason: "slash_command" };
  }

  // ─── MUST_SKIP (deterministic, before AI) ──────────────────────────
  // 1. Sender is a bot — never comment on other bots' messages
  if (ctx.senderIsBot) {
    return { verdict: "must_skip", reason: "sender_is_bot" };
  }
  // 2. Reply to someone else (not Limor)
  if (ctx.hasQuotedMsg && !ctx.quotedMsgFromMe) {
    return { verdict: "must_skip", reason: "reply_to_other" };
  }
  // 3. @mentions someone else but NOT Limor
  if (ctx.mentionedIds.length > 0) {
    const mentionsLimor = ctx.limorWhatsAppId && ctx.mentionedIds.some(id => id === ctx.limorWhatsAppId);
    if (!mentionsLimor) {
      return { verdict: "must_skip", reason: "mention_directed_at_other" };
    }
  }
  // 4. Part of active thread between others (without Limor)
  if (ctx.inOtherThread) {
    return { verdict: "must_skip", reason: "in_other_thread" };
  }

  // ─── LET_AI_DECIDE (ambiguous) ─────────────────────────────────────
  return { verdict: "let_ai_decide", reason: "no_clear_signal" };
}

// Track when Limor last responded in each group (for conversation continuation)
const lastResponseTime = new Map<string, number>();
const CONVERSATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Call this after Limor responds in a group */
export function recordGroupResponse(chatId: string): void {
  lastResponseTime.set(chatId, Date.now());
}

/** Check if Limor responded recently in this group (within conversation window) */
export function hasRecentGroupResponse(chatId: string): boolean {
  const lastResponse = lastResponseTime.get(chatId);
  return !!lastResponse && Date.now() - lastResponse < CONVERSATION_WINDOW_MS;
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
  contactName: string,
  chatId?: string
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

  // Conversation continuation: if Limor responded in this group recently,
  // treat the next messages as part of the conversation (let AI decide SKIP)
  if (chatId) {
    const lastResponse = lastResponseTime.get(chatId);
    if (lastResponse && Date.now() - lastResponse < CONVERSATION_WINDOW_MS) {
      return { shouldRespond: true, isDirect: false, confidence: 0.7 };
    }
  }

  // Check for command intent directed at bot
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
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
