/**
 * Thread Tracker — tracks active conversation threads in groups.
 * Knows who is talking to whom, so Limor can avoid interfering.
 */

interface ActiveThread {
  id: string;
  participants: Set<string>;
  lastMessageAt: number;
  topic: string;
  messageCount: number;
}

const THREAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const CONTINUATION_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// chatId → threads
const groupThreads = new Map<string, ActiveThread[]>();

let threadCounter = 0;

function cleanExpired(chatId: string): void {
  const threads = groupThreads.get(chatId);
  if (!threads) return;
  const now = Date.now();
  const active = threads.filter((t) => now - t.lastMessageAt < THREAD_TIMEOUT_MS);
  if (active.length === 0) {
    groupThreads.delete(chatId);
  } else {
    groupThreads.set(chatId, active);
  }
}

/**
 * Track a message in a group conversation.
 * @param chatId - Group chat ID
 * @param senderName - Who sent this message
 * @param replyToSender - If this is a reply, who was the original sender (extracted from quoted message)
 * @param messagePreview - First ~50 chars of the message for topic identification
 */
export function trackMessage(
  chatId: string,
  senderName: string,
  replyToSender?: string,
  messagePreview?: string
): void {
  cleanExpired(chatId);
  const now = Date.now();

  if (!groupThreads.has(chatId)) {
    groupThreads.set(chatId, []);
  }
  const threads = groupThreads.get(chatId)!;

  // Case 1: Reply to someone → create or update thread between sender and replied-to
  if (replyToSender && replyToSender !== senderName) {
    // Find existing thread with these two participants
    const existing = threads.find(
      (t) => t.participants.has(senderName) && t.participants.has(replyToSender)
    );
    if (existing) {
      existing.lastMessageAt = now;
      existing.messageCount++;
      return;
    }
    // Create new thread
    threads.push({
      id: `thread-${++threadCounter}`,
      participants: new Set([senderName, replyToSender]),
      lastMessageAt: now,
      topic: (messagePreview || "").substring(0, 50),
      messageCount: 1,
    });
    return;
  }

  // Case 2: No reply — check if sender is part of a recent thread (continuation)
  const recentThread = threads.find(
    (t) => t.participants.has(senderName) && now - t.lastMessageAt < CONTINUATION_WINDOW_MS
  );
  if (recentThread) {
    recentThread.lastMessageAt = now;
    recentThread.messageCount++;
  }
}

/**
 * Get all active threads in a group.
 */
export function getActiveThreads(chatId: string): ActiveThread[] {
  cleanExpired(chatId);
  return groupThreads.get(chatId) || [];
}

/**
 * Check if the current message is part of a thread that doesn't include Limor.
 * @param chatId - Group chat ID
 * @param senderName - Who sent the current message
 * @param limorNames - Limor's possible names in the group
 */
export function isPartOfOtherThread(
  chatId: string,
  senderName: string,
  limorNames: string[] = ["Limor Rani's Ai", "לימור"]
): boolean {
  cleanExpired(chatId);
  const threads = groupThreads.get(chatId) || [];

  for (const thread of threads) {
    // If sender is in this thread AND Limor is NOT in this thread
    if (thread.participants.has(senderName)) {
      const limorInThread = limorNames.some((name) => thread.participants.has(name));
      if (!limorInThread) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Format active threads as context for the AI.
 */
export function formatThreadContext(chatId: string, currentSender: string): string {
  const threads = getActiveThreads(chatId);
  if (threads.length === 0) return "";

  const now = Date.now();
  const lines = threads.map((t) => {
    const participants = Array.from(t.participants).join(" ↔ ");
    const ago = Math.round((now - t.lastMessageAt) / 60000);
    const agoText = ago === 0 ? "עכשיו" : `לפני ${ago} דקות`;
    return `🔗 ${participants}: "${t.topic}" (${t.messageCount} הודעות, ${agoText})`;
  });

  let context = `### שיחות פעילות בקבוצה:\n${lines.join("\n")}`;

  // Check if current sender is in a thread that doesn't include Limor
  const inOtherThread = isPartOfOtherThread(chatId, currentSender);
  if (inOtherThread) {
    context += `\n\n⚠️ ההודעה הנוכחית מ-${currentSender} שייכת לשיחה פעילה בין אנשים אחרים — לא מכוונת אלייך! חובה [SKIP]!`;
  }

  return context;
}
