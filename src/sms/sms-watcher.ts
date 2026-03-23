/**
 * SMS Sender Watcher — monitors SMS from specific senders and forwards to owner via WhatsApp.
 *
 * Use case: HAREL (הראל insurance) sends SMS to Rani's iPhone →
 *           Limor auto-forwards the message via WhatsApp.
 *
 * Design mirrors telegram/alert-poller.ts:
 *   - polls macOS Messages DB every POLL_INTERVAL_MS
 *   - tracks last seen message ID to avoid duplicates
 *   - persists last-seen ID across restarts
 *   - supports multiple watched senders with per-sender config
 */

import { isAvailable, getMessagesSince, getLatestMessageId } from "./sms-reader";
import type { SmsMessage } from "./sms-reader";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { statePath } from "../state-dir";

// ─── Watcher configuration ────────────────────────────────────────────────────

export interface SmsWatcherConfig {
  /** Sender name/number to watch (substring match, case-insensitive) */
  sender: string;
  /** Human-readable label for WhatsApp messages */
  label: string;
  /** Emoji prefix for forwarded messages */
  emoji: string;
  /** If set, only forward messages whose text contains one of these keywords */
  keywords?: string[];
  /** If set, skip messages whose text contains any of these strings */
  excludeKeywords?: string[];
}

/** Watched senders — add new entries here to monitor additional SMS senders */
const WATCHED_SENDERS: SmsWatcherConfig[] = [
  {
    sender: "HAREL",
    label: "הראל ביטוח",
    emoji: "🏥",
    // No keyword filter — forward ALL messages from HAREL
  },
  {
    sender: "OPHIR",
    label: "אופיר",
    emoji: "📩",
    // Forward ONLY authentication/OTP messages — skip Family Sharing screen time requests
    keywords: [
      "verification code",
      "your code",
      "קוד אימות",
      "קוד",
      "otp",
      "one-time",
      "one time",
      "passcode",
      "auth code",
      "confirmation code",
      "security code",
      "login code",
      "sign-in code",
      "access code",
      "2fa",
    ],
    excludeKeywords: [
      "asked for more time",
      "wants more time",
      "screen time",
      "asked to add",
      "wants to add",
      "requested more time",
      "more time for",
    ],
  },
  // Add more senders here, for example:
  // { sender: "Maccabi", label: "מכבי שירותי בריאות", emoji: "💊" },
  // { sender: "Leumi", label: "בנק לאומי", emoji: "🏦", keywords: ["חיוב", "הפקדה", "יתרה"] },
];

// ─── State persistence ─────────────────────────────────────────────────────────

const STATE_PATH = statePath("sms-watcher-state.json");

interface WatcherState {
  lastCheckedId: number;
  /** ISO timestamp of last successful poll */
  lastPollAt?: string;
  /** Count of messages forwarded since start */
  totalForwarded: number;
}

function loadState(): WatcherState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    }
  } catch {
    // Ignore — start fresh
  }
  return { lastCheckedId: 0, totalForwarded: 0 };
}

function saveState(state: WatcherState): void {
  try {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("[sms-watcher] Failed to save state:", err);
  }
}

// ─── Filtering ─────────────────────────────────────────────────────────────────

function isSenderMatch(msg: SmsMessage, watchedSender: string): boolean {
  const senderLower = msg.sender.toLowerCase();
  const watchLower = watchedSender.toLowerCase();
  return senderLower.includes(watchLower);
}

function shouldForward(msg: SmsMessage, config: SmsWatcherConfig): boolean {
  if (msg.isFromMe) return false;
  if (!isSenderMatch(msg, config.sender)) return false;

  // iOS stores some SMS as binary NSObject metadata — extract auth code if present
  if (/Z\$classname|X\$classes|NSObject|DDScanner|bplist/i.test(msg.text)) {
    const authMatch = msg.text.match(/T(\d{4,6})XAuthCode/);
    if (authMatch) {
      // Replace binary text with extracted auth code
      msg.text = `קוד האימות הוא ${authMatch[1]}`;
    } else {
      return false; // No auth code found in binary — skip
    }
  }
  if (msg.text.length < 3) return false;

  const textLower = msg.text.toLowerCase();

  // Exclude keywords
  if (config.excludeKeywords) {
    for (const kw of config.excludeKeywords) {
      if (textLower.includes(kw.toLowerCase())) return false;
    }
  }

  // Include keyword filter (if defined, must match at least one)
  if (config.keywords && config.keywords.length > 0) {
    return config.keywords.some((kw) => textLower.includes(kw.toLowerCase()));
  }

  return true; // No keyword filter → forward all
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatMessage(msg: SmsMessage, config: SmsWatcherConfig): string {
  const time = msg.timestamp ? ` (${msg.timestamp})` : "";
  return `${config.emoji} *SMS מ-${config.label}*${time}\n\n${msg.text}`;
}

// ─── Core poller ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10 * 1000; // 10 seconds — near real-time

let notifyOwner: ((text: string) => Promise<void>) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let state: WatcherState = { lastCheckedId: 0, totalForwarded: 0 };

async function pollOnce(): Promise<void> {
  if (!notifyOwner) return;

  try {
    const newMessages = getMessagesSince(state.lastCheckedId, 100);
    if (newMessages.length === 0) return;

    // Advance cursor regardless — skip past these IDs even if nothing matches
    const maxId = Math.max(...newMessages.map((m) => m.id));
    if (maxId > state.lastCheckedId) {
      state.lastCheckedId = maxId;
      state.lastPollAt = new Date().toISOString();
      saveState(state);
    }

    // Check each watched sender
    for (const watchConfig of WATCHED_SENDERS) {
      const matching = newMessages.filter((m) => shouldForward(m, watchConfig));

      for (const msg of matching) {
        const text = formatMessage(msg, watchConfig);
        try {
          await notifyOwner(text);
          state.totalForwarded++;
          saveState(state);
          console.log(
            `[sms-watcher] Forwarded from ${watchConfig.sender}: "${msg.text.substring(0, 60)}..."`
          );
        } catch (err) {
          console.error(`[sms-watcher] Failed to forward from ${watchConfig.sender}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[sms-watcher] Poll error:", err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the SMS sender watcher.
 * Call once at startup (after WhatsApp is ready).
 *
 * @param onNotify    Callback to send a message to owner via WhatsApp
 * @param intervalMs  Poll interval in ms (default: 60 seconds)
 */
export function startSmsWatcher(
  onNotify: (text: string) => Promise<void>,
  intervalMs: number = POLL_INTERVAL_MS
): void {
  if (!isAvailable()) {
    console.log("[sms-watcher] Messages DB not available — watcher disabled");
    return;
  }

  if (pollTimer) {
    console.log("[sms-watcher] Already running");
    return;
  }

  notifyOwner = onNotify;

  // Load persisted state — if no saved ID, use current latest so we don't
  // flood the owner with historic messages on first start
  state = loadState();
  if (state.lastCheckedId === 0) {
    state.lastCheckedId = getLatestMessageId();
    state.lastPollAt = new Date().toISOString();
    saveState(state);
    console.log(
      `[sms-watcher] First run — initialized cursor at ID ${state.lastCheckedId}`
    );
  } else {
    console.log(
      `[sms-watcher] Resumed from ID ${state.lastCheckedId} (last poll: ${state.lastPollAt || "unknown"})`
    );
  }

  const watcherNames = WATCHED_SENDERS.map((w) => w.sender).join(", ");
  console.log(
    `[sms-watcher] Started — watching: [${watcherNames}] every ${intervalMs / 1000}s`
  );

  // Run once immediately — catches messages that arrived while bot was offline
  pollOnce();

  pollTimer = setInterval(pollOnce, intervalMs);
}

/**
 * Stop the SMS sender watcher.
 */
export function stopSmsWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[sms-watcher] Stopped");
  }
}

/**
 * Get current watcher status (for monitoring/debug).
 */
export function getSmsWatcherStatus(): {
  running: boolean;
  lastCheckedId: number;
  lastPollAt?: string;
  totalForwarded: number;
  watchedSenders: string[];
} {
  return {
    running: !!pollTimer,
    lastCheckedId: state.lastCheckedId,
    lastPollAt: state.lastPollAt,
    totalForwarded: state.totalForwarded,
    watchedSenders: WATCHED_SENDERS.map((w) => w.sender),
  };
}
