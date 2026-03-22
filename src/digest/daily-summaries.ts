/**
 * Daily executive briefing generator.
 * For each chatId with today's messages, extracts urgent/open/done/failed items.
 * Saves results to workspace/state/daily-summaries.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import { client, withRetry } from "../ai/client";
import { getGroupNameById } from "../muted-groups";

// --- Types ---

export interface DailySummary {
  chatId: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  urgent: string[];
  open: string[];
  done: string[];
  failed: string[];
}

export interface DailySummaryFile {
  date: string;
  summaries: DailySummary[];
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

type ConversationStore = Record<string, StoredMessage[]>;
type ContactsStore = Record<
  string,
  { chatId: string; name: string; phone: string }
>;

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
  try {
    const { SqliteConversationStore } = require("../stores/sqlite-conversation-store");
    const store = new SqliteConversationStore();
    const chatIds = store.getAllChatIds();
    const result: ConversationStore = {};
    for (const chatId of chatIds) {
      const history = store.getHistory(chatId);
      if (history.length > 0) {
        result[chatId] = history.map((m: any) => ({ role: m.role, content: m.content }));
      }
    }
    return result;
  } catch (err) {
    console.error("[daily-summaries] Failed to load conversations from SQLite:", err);
    return {};
  }
}

function loadContacts(): ContactsStore {
  try {
    const { listAllContacts, findContactByPhone } = require("../contacts");
    // contacts.ts returns a formatted string — we need to parse the underlying data
    const p = statePath("contacts.json");
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8"));
    }
    return {};
  } catch {
    return {};
  }
}

function todayDateString(): string {
  // Israel time
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
}

/**
 * Resolve chatId to a human-readable name.
 * Priority: contacts store > group registry > stripped chatId (never raw IDs).
 */
function resolveContactName(
  chatId: string,
  contacts: ContactsStore,
): string {
  // Direct contact match
  const contact = contacts[chatId];
  if (contact?.name) return contact.name;

  // Group — try the group registry
  if (chatId.endsWith("@g.us")) {
    const groupName = getGroupNameById(chatId);
    if (groupName) return groupName;
    // Fallback: strip @g.us suffix
    return chatId.split("@")[0];
  }

  // Personal chat — try to find by phone prefix in contacts
  const phonePrefix = chatId.split("@")[0];
  for (const c of Object.values(contacts)) {
    if (c.phone?.replace(/\D/g, "") === phonePrefix) {
      return c.name;
    }
  }

  return phonePrefix;
}

async function analyzeChat(
  chatId: string,
  messages: StoredMessage[],
  contactName: string,
  isGroup: boolean,
): Promise<DailySummary | null> {
  if (messages.length === 0) return null;

  const formattedMessages = messages
    .map(
      (m) =>
        `${m.role === "user" ? (isGroup ? "משתמש" : contactName) : "לימור"}: ${m.content.substring(0, 500)}`,
    )
    .join("\n");

  const groupInstruction = isGroup
    ? `זו שיחת קבוצה. שמות משתתפים מופיעים בסוגריים מרובעים [שם]:.`
    : "";

  const prompt = `אתה עוזר אישי שמכין בריפינג לבעלים.

${groupInstruction}

מהשיחות האלה עם ${contactName} (${messages.length} הודעות), חלץ:
1. דחוף — מה דורש תשומת לב מיידית? (מישהו מחכה, דדליין, בקשה שלא טופלה)
2. פתוח — מה עדיין לא סגור? (בקשות, שאלות, נושאים שצריך לחזור אליהם)
3. טופל — מה כן נעשה? (בקצרה, שורה אחת לכל פריט)
4. כשלים — מה לימור לא הצליחה לעשות? (tool failures, שגיאות, hallucinations)

שיחה:
${formattedMessages}

החזר JSON בלבד (בלי markdown, בלי backticks):
{
  "urgent": ["יוני מחכה לתשובה ממך מ-10 בבוקר"],
  "open": ["דורון ביקש לבטל פגישות ביום ראשון"],
  "done": ["פגישה עם עמית ב-15:40 תואמה"],
  "failed": ["ניסיתי להחליף מודל אבל לא הצלחתי"]
}

כללים:
- קצר! שורה אחת לכל פריט
- שמות אנשים, לא "המשתמש" ולא "הלקוח"
- רק דברים מהיום — לא היסטוריה ישנה
- אם אין מה לדווח בקטגוריה — מערך ריק []
- כתוב בעברית
- אקשן-אוריינטד: "יוני מחכה לתשובה" ולא "התנהלה שיחה עם יוני"`;

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
    const jsonStr = text
      .replace(/```json?\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr);

    return {
      chatId,
      contactName,
      isGroup,
      messageCount: messages.length,
      urgent: Array.isArray(parsed.urgent) ? parsed.urgent : [],
      open: Array.isArray(parsed.open) ? parsed.open : [],
      done: Array.isArray(parsed.done) ? parsed.done : [],
      failed: Array.isArray(parsed.failed) ? parsed.failed : [],
    };
  } catch (err) {
    console.error(
      `[daily-summaries] Failed to analyze chat ${chatId}:`,
      err,
    );
    return {
      chatId,
      contactName,
      isGroup,
      messageCount: messages.length,
      urgent: [],
      open: [],
      done: [`${messages.length} הודעות — לא הצלחתי לנתח אוטומטית`],
      failed: [],
    };
  }
}

// --- Main export ---

/**
 * Generate daily executive briefing for all conversations with messages.
 * Saves to daily-summaries.json and returns the summaries.
 */
export async function generateDailySummaries(): Promise<DailySummary[]> {
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

  console.log(
    `[daily-summaries] Analyzing ${chatIds.length} conversations...`,
  );

  const summaries: DailySummary[] = [];

  for (const chatId of chatIds) {
    const messages = conversations[chatId];
    if (!messages || messages.length === 0) continue;

    const contactName = resolveContactName(chatId, contacts);
    const isGroup = chatId.endsWith("@g.us");

    const summary = await analyzeChat(chatId, messages, contactName, isGroup);
    if (summary) {
      // Only include if there's actually something to report
      const hasContent =
        summary.urgent.length > 0 ||
        summary.open.length > 0 ||
        summary.done.length > 0 ||
        summary.failed.length > 0;
      if (hasContent) {
        summaries.push(summary);
      }
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

  console.log(
    `[daily-summaries] Generated ${summaries.length} briefings for ${today}`,
  );
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
