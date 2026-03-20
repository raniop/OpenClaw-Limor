/**
 * Daily conversation summary generator.
 * For each chatId with today's messages, generates a Hebrew summary using Sonnet.
 * Saves results to workspace/state/daily-summaries.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import { client, withRetry } from "../ai/client";

// --- Types ---

export interface ChatSummary {
  chatId: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  summary: string;
  topics: string[];
  openItems: string[];
  mood: string;
}

export interface DailySummaryFile {
  date: string;
  summaries: ChatSummary[];
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

type ConversationStore = Record<string, StoredMessage[]>;
type ContactsStore = Record<string, { chatId: string; name: string; phone: string }>;

// --- Helpers ---

const SUMMARIES_PATH = statePath("daily-summaries.json");

function ensureDir(): void {
  const dir = dirname(SUMMARIES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadSummariesFile(): DailySummaryFile[] {
  ensureDir();
  if (!existsSync(SUMMARIES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(SUMMARIES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveSummariesFile(entries: DailySummaryFile[]): void {
  ensureDir();
  // Keep last 90 days
  const trimmed = entries.slice(-90);
  writeFileSync(SUMMARIES_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
}

function loadConversations(): ConversationStore {
  const p = statePath("conversations.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function loadContacts(): ContactsStore {
  const p = statePath("contacts.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function todayDateString(): string {
  // Israel time
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
}

/**
 * Extract messages from today based on content timestamps or message position.
 * Since messages don't have timestamps, we use a heuristic:
 * group messages often have [Name]: prefix pattern.
 * We take all messages as "today's" since the store is trimmed regularly.
 */
function getContactName(chatId: string, contacts: ContactsStore): string {
  const contact = contacts[chatId];
  if (contact) return contact.name;
  // For groups, try to extract a readable name
  if (chatId.endsWith("@g.us")) {
    return `Group ${chatId.split("@")[0].slice(-6)}`;
  }
  return chatId.split("@")[0];
}

async function summarizeChat(
  chatId: string,
  messages: StoredMessage[],
  contactName: string,
  isGroup: boolean,
): Promise<ChatSummary | null> {
  if (messages.length === 0) return null;

  const formattedMessages = messages
    .map((m) => `${m.role === "user" ? (isGroup ? "משתמש" : contactName) : "לימור"}: ${m.content.substring(0, 300)}`)
    .join("\n");

  const groupInstruction = isGroup
    ? `זו שיחת קבוצה. שים לב למשתתפים השונים (שמות מופיעים בסוגריים מרובעים [שם]:).
ציין את המשתתפים הבולטים ומה כל אחד אמר.`
    : "";

  const prompt = `אתה מסכם שיחות יומיות. תפקידך ליצור סיכום תמציתי של השיחה.

${groupInstruction}

שיחה עם ${contactName} (${messages.length} הודעות):
${formattedMessages}

החזר תשובה בפורמט JSON בלבד (בלי markdown, בלי backticks):
{
  "summary": "סיכום של 3-5 שורות בעברית: מה דובר, מה הוחלט/נעשה, מה עדיין פתוח, ומה הטון של השיחה",
  "topics": ["נושא1", "נושא2"],
  "openItems": ["פריט פתוח 1"],
  "mood": "friendly/business/urgent/casual/tense"
}

כללים:
- כתוב בעברית
- הסיכום צריך להיות תמציתי אבל מקיף
- topics: רשימת נושאים עיקריים (2-5 נושאים)
- openItems: דברים שעדיין פתוחים או ממתינים לטיפול (רשימה ריקה אם אין)
- mood: אחד מ-friendly/business/urgent/casual/tense
- החזר JSON תקין בלבד`;

  try {
    const response = await withRetry(() =>
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    );

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse JSON from response — strip markdown fences if present
    const jsonStr = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      chatId,
      contactName,
      isGroup,
      messageCount: messages.length,
      summary: parsed.summary || "",
      topics: parsed.topics || [],
      openItems: parsed.openItems || [],
      mood: parsed.mood || "casual",
    };
  } catch (err) {
    console.error(`[daily-summaries] Failed to summarize chat ${chatId}:`, err);
    // Fallback: basic summary without AI
    return {
      chatId,
      contactName,
      isGroup,
      messageCount: messages.length,
      summary: `${messages.length} הודעות. לא הצלחתי ליצור סיכום אוטומטי.`,
      topics: [],
      openItems: [],
      mood: "casual",
    };
  }
}

// --- Main export ---

/**
 * Generate daily summaries for all conversations with messages.
 * Saves to daily-summaries.json and returns the summaries.
 */
export async function generateDailySummaries(): Promise<ChatSummary[]> {
  const conversations = loadConversations();
  const contacts = loadContacts();
  const today = todayDateString();

  const chatIds = Object.keys(conversations).filter(
    (id) => conversations[id] && conversations[id].length > 0,
  );

  if (chatIds.length === 0) {
    console.log("[daily-summaries] No conversations to summarize");
    return [];
  }

  console.log(`[daily-summaries] Summarizing ${chatIds.length} conversations...`);

  const summaries: ChatSummary[] = [];

  for (const chatId of chatIds) {
    const messages = conversations[chatId];
    if (!messages || messages.length === 0) continue;

    const contactName = getContactName(chatId, contacts);
    const isGroup = chatId.endsWith("@g.us");

    const summary = await summarizeChat(chatId, messages, contactName, isGroup);
    if (summary) {
      summaries.push(summary);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  // Save to file
  const allEntries = loadSummariesFile();

  // Replace today's entry if it exists, otherwise add
  const existingIdx = allEntries.findIndex((e) => e.date === today);
  const todayEntry: DailySummaryFile = { date: today, summaries };

  if (existingIdx >= 0) {
    allEntries[existingIdx] = todayEntry;
  } else {
    allEntries.push(todayEntry);
  }

  saveSummariesFile(allEntries);

  console.log(`[daily-summaries] Generated ${summaries.length} summaries for ${today}`);
  return summaries;
}

/**
 * Get summaries for a specific date.
 */
export function getDailySummaries(date?: string): DailySummaryFile | null {
  const targetDate = date || todayDateString();
  const allEntries = loadSummariesFile();
  return allEntries.find((e) => e.date === targetDate) || null;
}

/**
 * Get all available summary dates.
 */
export function getAvailableSummaryDates(): string[] {
  const allEntries = loadSummariesFile();
  return allEntries.map((e) => e.date).reverse();
}
