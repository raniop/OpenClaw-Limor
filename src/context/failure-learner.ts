/**
 * Failure Learner — learns from tool failures to prevent repeated mistakes.
 * When a tool fails, logs the failure. When a pattern emerges (same tool
 * failing repeatedly), uses Sonnet to extract a preventive rule and saves
 * it as an instruction.
 *
 * Mirrors the correction-learner pattern but triggered by tool errors
 * instead of user corrections.
 */
import { client } from "../ai/client";
import { config } from "../config";
import { saveInstruction, getInstructionsContext } from "../instructions";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { statePath } from "../state-dir";

interface FailureEntry {
  toolName: string;
  error: string;
  input: string; // truncated input summary
  timestamp: string;
}

interface FailureLog {
  entries: FailureEntry[];
  rulesGenerated: string[]; // tool names that already have a rule
}

const FAILURE_LOG_PATH = statePath("failure-log.json");
const MAX_ENTRIES = 200;
const PATTERN_THRESHOLD = 3; // failures before analyzing

function loadLog(): FailureLog {
  if (existsSync(FAILURE_LOG_PATH)) {
    try {
      return JSON.parse(readFileSync(FAILURE_LOG_PATH, "utf-8"));
    } catch {}
  }
  return { entries: [], rulesGenerated: [] };
}

function saveLog(log: FailureLog): void {
  writeFileSync(FAILURE_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

/**
 * Record a tool failure. If a pattern is detected, trigger analysis.
 */
export function recordToolFailure(
  toolName: string,
  error: string,
  input: Record<string, any>
): void {
  const log = loadLog();

  // Truncate input to key names + short values
  const inputSummary = Object.entries(input)
    .map(([k, v]) => `${k}=${String(v).slice(0, 50)}`)
    .join(", ")
    .slice(0, 200);

  log.entries.push({
    toolName,
    error: error.slice(0, 300),
    input: inputSummary,
    timestamp: new Date().toISOString(),
  });

  // Trim old entries
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(-MAX_ENTRIES);
  }

  saveLog(log);

  // Check for pattern: same tool failing multiple times in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentFailures = log.entries.filter(
    (e) => e.toolName === toolName && e.timestamp >= weekAgo
  );

  if (
    recentFailures.length >= PATTERN_THRESHOLD &&
    !log.rulesGenerated.includes(toolName)
  ) {
    // Analyze in background — don't block the response
    analyzeFailurePattern(toolName, recentFailures).catch((err) =>
      console.error(`[failure-learner] Analysis failed for ${toolName}:`, err)
    );
  }
}

const ANALYSIS_PROMPT = `אתה מנתח כשלים טכניים של ${config.botName} (בוט WhatsApp AI).
קיבלת רשימת כשלים חוזרים של כלי (tool) ספציפי.
תפקידך: לחלץ כלל מניעתי ש${config.botName} תוכל ליישם כדי למנוע את הכשל בעתיד.

החזר JSON בלבד (בלי markdown, בלי backticks):
{"rule": "הכלל בעברית, קצר וברור — כולל שם הכלי ומה לעשות אחרת", "relevant": true}

אם הכשלים אקראיים/חד-פעמיים ולא ניתנים למניעה (שגיאות רשת, timeout), החזר:
{"rule": "", "relevant": false}

דוגמאות לכללים טובים:
- "לפני create_event, תמיד לוודא שה-timezone מצוין בפורמט ISO"
- "כשמשתמשים ב-web_search, להוסיף שנה לחיפוש כדי לקבל תוצאות עדכניות"
- "ב-send_message, לוודא ש-chatId לא ריק לפני שליחה"
- "ב-booking, לא להעביר שעות בפורמט 12h — תמיד 24h"

כתוב כלל ספציפי ופרקטי. אם יש הוראות קיימות שכבר מכסות את הנושא, החזר relevant: false.`;

async function analyzeFailurePattern(
  toolName: string,
  failures: FailureEntry[]
): Promise<void> {
  console.log(
    `[failure-learner] Analyzing pattern for ${toolName} (${failures.length} failures)`
  );

  // Check existing instructions to avoid duplicates
  const existingInstructions = getInstructionsContext();

  const failureSummary = failures
    .slice(-5) // last 5 failures of this tool
    .map(
      (f) =>
        `- [${f.timestamp.split("T")[0]}] שגיאה: ${f.error}\n  קלט: ${f.input}`
    )
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: ANALYSIS_PROMPT,
      messages: [
        {
          role: "user",
          content: `כלי: ${toolName}\nכשלים חוזרים (${failures.length} פעמים ב-7 ימים):\n${failureSummary}\n\nהוראות קיימות:\n${existingInstructions || "אין"}`,
        },
      ],
    });

    const text =
      response.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(text);

    if (parsed.relevant && parsed.rule && parsed.rule.length > 5) {
      saveInstruction(`[למדתי מכשל] ${parsed.rule}`);
      console.log(`[failure-learner] Saved rule: ${parsed.rule}`);

      // Mark this tool as having a rule to avoid re-analysis
      const log = loadLog();
      log.rulesGenerated.push(toolName);
      saveLog(log);
    } else {
      console.log(
        `[failure-learner] No preventive rule for ${toolName} (transient errors)`
      );
    }
  } catch (error) {
    console.error("[failure-learner] Failed to analyze pattern:", error);
  }
}

/**
 * Get failure stats for diagnostics / dashboard.
 */
export function getFailureStats(): Record<string, number> {
  const log = loadLog();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = log.entries.filter((e) => e.timestamp >= weekAgo);

  const stats: Record<string, number> = {};
  for (const entry of recent) {
    stats[entry.toolName] = (stats[entry.toolName] || 0) + 1;
  }
  return stats;
}
