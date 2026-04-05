/**
 * Topic Segmenter — extracts structured conversation segments from dropped messages.
 *
 * When messages rotate out of the conversation history, this module extracts
 * distinct topic segments with structured metadata. These segments are stored
 * in SQLite and can be retrieved later for context injection.
 *
 * Uses Claude Sonnet for extraction (same cost as existing summarization).
 */
import { client as aiClient } from "../ai/client";
import { config } from "../config";
import { getDb } from "../stores/sqlite-init";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface TopicSegment {
  id?: number;
  chatId: string;
  topic: string;
  summary: string;
  keyDetails?: string;    // JSON: names, dates, decisions
  startedAt: string;
  endedAt?: string;
  messageCount: number;
}

/**
 * Extract topic segments from dropped messages and save to SQLite.
 * Called from conversation.ts alongside the rolling summary.
 * Runs in background — non-blocking.
 */
export async function extractTopicSegments(chatId: string, messages: Message[]): Promise<void> {
  if (messages.length < 5) return; // Need enough messages for meaningful segments

  try {
    const conversation = messages
      .map((m) => `${m.role === "user" ? "משתמש" : config.botName}: ${m.content.substring(0, 200)}`)
      .join("\n");

    const prompt = `נתח את השיחה הבאה וחלץ 1-3 נושאי שיחה נפרדים. כל נושא הוא "פרק" בשיחה.

שיחה:
${conversation}

החזר JSON בלבד (בלי markdown) — מערך של נושאים:
[
  {
    "topic": "שם הנושא בקצרה (3-6 מילים)",
    "summary": "תקציר של 1-2 משפטים — מה דובר, מה הוחלט, מה נעשה",
    "keyDetails": {
      "people": ["שמות אנשים שהוזכרו"],
      "decisions": ["החלטות שהתקבלו"],
      "dates": ["תאריכים או זמנים שהוזכרו"],
      "commitments": ["התחייבויות שניתנו"]
    },
    "messageCount": 10
  }
]

כללים:
- 1-3 נושאים מקסימום
- שמור על שמות מדויקים
- שמור על תאריכים וזמנים
- אם כל ההודעות על נושא אחד — החזר נושא אחד בלבד
- כתוב בעברית`;

    const response = await aiClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content.find((b) => b.type === "text") as any)?.text || "";
    if (text.length < 10) return;

    const cleaned = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const segments = JSON.parse(cleaned) as Array<{
      topic: string;
      summary: string;
      keyDetails?: Record<string, string[]>;
      messageCount?: number;
    }>;

    if (!Array.isArray(segments) || segments.length === 0) return;

    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      "INSERT INTO topic_segments (chat_id, topic, summary, key_details, started_at, message_count) VALUES (?, ?, ?, ?, ?, ?)"
    );

    for (const seg of segments.slice(0, 3)) {
      if (!seg.topic || !seg.summary) continue;
      stmt.run(
        chatId,
        seg.topic,
        seg.summary,
        seg.keyDetails ? JSON.stringify(seg.keyDetails) : null,
        now,
        seg.messageCount || messages.length,
      );
    }

    // Cleanup: keep only last 50 segments per chat to prevent unbounded growth
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM topic_segments WHERE chat_id = ?").get(chatId) as any).cnt;
    if (count > 50) {
      db.prepare(`
        DELETE FROM topic_segments WHERE id IN (
          SELECT id FROM topic_segments WHERE chat_id = ? ORDER BY id ASC LIMIT ?
        )
      `).run(chatId, count - 50);
    }

    console.log(`[topic-segmenter] Extracted ${segments.length} segments for ${chatId.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  } catch (err) {
    console.error("[topic-segmenter] Failed to extract segments:", err);
  }
}
