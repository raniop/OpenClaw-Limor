/**
 * Social Graph Analyzer — nightly relationship inference.
 * Analyzes interaction patterns to automatically update relationship
 * profiles (type, communication style, importance score).
 * Runs daily at 02:30 Israel time.
 */
import { schedule, ScheduledTask } from "node-cron";
import { client as aiClient, withRetry } from "../ai/client";
import { config } from "../config";
import { getDb } from "../stores/sqlite-init";
import { getProfile, upsertProfile, listProfiles } from "../relationship-memory/relationship-store";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import type { RelationshipProfile } from "../relationship-memory/relationship-types";

let socialTask: ScheduledTask | null = null;

const MIN_MESSAGES = 5;
const ANALYSIS_DAYS = 30;
const MAX_CONTACTS = 10;
const MAX_MSGS_PER_CONTACT = 50;
const MSG_TRUNCATE = 200;

const ANALYSIS_PROMPT = `אתה מנתח קשרים חברתיים. אתה מקבל היסטוריית שיחות בין משתמש לאיש קשר דרך בוט WhatsApp AI.
משימתך: לנתח את סוג הקשר, סגנון התקשורת, ורמת החשיבות.

## סוגי קשר אפשריים:
- unknown — לא ברור
- client — לקוח/עסקי
- lead — ליד פוטנציאלי
- friend — חבר
- family — משפחה
- work — עמית עבודה
- service — נותן שירות

## סגנונות תקשורת:
- unknown — לא ברור
- formal — רשמי
- friendly — ידידותי
- brief — קצר ותכליתי
- warm — חם ואישי

## הוראות:
- נתח את הטון, הנושאים, התדירות, והעומק של השיחות
- אם יש פרופיל קיים — עדכן רק מה שהשתנה, אל תדרוס מידע ידני
- ציון חשיבות 1-100 (100=הכי חשוב, כמו משפחה קרובה או שותף עסקי)
- הערות: 1-2 משפטים קצרים על הקשר

החזר JSON בלבד (בלי markdown):
{
  "relationshipType": "friend",
  "communicationStyle": "friendly",
  "importanceScore": 65,
  "notes": ["חבר קרוב, מדברים על טיולים ומסעדות"]
}`;

interface ContactConversation {
  chatId: string;
  name: string;
  messages: Array<{ role: string; content: string; created_at: string }>;
}

function getActiveContacts(): ContactConversation[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - ANALYSIS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Find contacts with enough recent activity (excluding owner and groups)
  const rows = db.prepare(`
    SELECT c.chat_id, c.name, COUNT(*) as msg_count
    FROM conversations conv
    JOIN contacts c ON conv.chat_id = c.chat_id
    WHERE conv.created_at >= ? AND conv.chat_id != ? AND c.chat_id NOT LIKE '%@g.us'
    GROUP BY c.chat_id
    HAVING msg_count >= ?
    ORDER BY msg_count DESC
    LIMIT ?
  `).all(cutoff, config.ownerChatId, MIN_MESSAGES, MAX_CONTACTS) as any[];

  return rows.map((row) => {
    const messages = db.prepare(`
      SELECT role, content, created_at FROM conversations
      WHERE chat_id = ? AND created_at >= ?
      ORDER BY id DESC LIMIT ?
    `).all(row.chat_id, cutoff, MAX_MSGS_PER_CONTACT) as any[];

    return {
      chatId: row.chat_id,
      name: row.name,
      messages: messages.reverse(), // chronological order
    };
  });
}

async function analyzeContact(contact: ContactConversation): Promise<{
  relationshipType: string;
  communicationStyle: string;
  importanceScore: number;
  notes: string[];
} | null> {
  const existing = getProfile(contact.chatId);
  const existingInfo = existing
    ? `\nפרופיל קיים: סוג=${existing.relationshipType}, סגנון=${existing.communicationStyle}, חשיבות=${existing.importanceScore}`
    : "\nאין פרופיל קיים";

  const msgText = contact.messages
    .map((m) => {
      const content = m.content.length > MSG_TRUNCATE ? m.content.slice(0, MSG_TRUNCATE) + "..." : m.content;
      return `[${m.created_at.split("T")[0]}] ${m.role}: ${content}`;
    })
    .join("\n");

  try {
    const response = await withRetry(() =>
      aiClient.messages.create({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 256,
        system: ANALYSIS_PROMPT,
        messages: [
          {
            role: "user",
            content: `איש קשר: ${contact.name}${existingInfo}\n\nשיחות (${contact.messages.length} הודעות):\n${msgText}`,
          },
        ],
      })
    );

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error(`[social-graph] Analysis failed for ${contact.name}:`, err.message);
    return null;
  }
}

/**
 * Run social graph analysis for all active contacts.
 */
export async function runSocialGraphAnalysis(): Promise<void> {
  console.log("[social-graph] Starting nightly relationship analysis...");

  const contacts = getActiveContacts();
  if (contacts.length === 0) {
    console.log("[social-graph] No active contacts to analyze");
    return;
  }

  console.log(`[social-graph] Analyzing ${contacts.length} contacts...`);
  const changes: string[] = [];

  for (const contact of contacts) {
    const result = await analyzeContact(contact);
    if (!result) continue;

    const existing = getProfile(contact.chatId);
    const now = new Date().toISOString();

    // Check if anything changed
    const changed =
      !existing ||
      existing.relationshipType !== result.relationshipType ||
      existing.communicationStyle !== result.communicationStyle ||
      Math.abs(existing.importanceScore - result.importanceScore) > 10;

    if (changed) {
      const profile: RelationshipProfile = {
        chatId: contact.chatId,
        name: contact.name,
        relationshipType: result.relationshipType as any,
        communicationStyle: result.communicationStyle as any,
        importanceScore: result.importanceScore,
        notes: result.notes || existing?.notes || [],
        interactionCount: existing?.interactionCount || contact.messages.length,
        lastInteractionAt: existing?.lastInteractionAt || now,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      upsertProfile(profile);

      const typeLabel = result.relationshipType !== (existing?.relationshipType || "unknown")
        ? ` (${existing?.relationshipType || "?"} → ${result.relationshipType})`
        : "";
      changes.push(`• ${contact.name}${typeLabel}: ${result.communicationStyle}, חשיבות ${result.importanceScore}`);
    }
  }

  console.log(`[social-graph] Done. ${changes.length} profiles updated.`);

  // Notify owner if there are changes
  if (changes.length > 0) {
    const notify = getNotifyOwnerCallback();
    if (notify) {
      await notify(`🧬 *עדכון גרף חברתי:*\n${changes.join("\n")}`);
      console.log("[social-graph] Report sent to owner");
    }
  }
}

/**
 * Start the social graph scheduler.
 * Runs daily at 02:30 Israel time.
 */
export function startSocialGraphScheduler(): void {
  if (socialTask) {
    console.log("[social-graph] Scheduler already running");
    return;
  }

  const tz = { timezone: "Asia/Jerusalem" as const };

  socialTask = schedule("30 2 * * *", () => {
    runSocialGraphAnalysis().catch((err) =>
      console.error("[social-graph] Unhandled error in scheduled run:", err)
    );
  }, tz);

  console.log("[social-graph] 🧬 Scheduler started (daily at 02:30 Israel time)");
}

/**
 * Stop the social graph scheduler.
 */
export function stopSocialGraphScheduler(): void {
  if (socialTask) {
    socialTask.stop();
    socialTask = null;
    console.log("[social-graph] Scheduler stopped");
  }
}
