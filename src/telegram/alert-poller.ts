/**
 * Telegram public channel poller for multiple channels.
 * Monitors public Telegram channels via web preview scraping.
 * No Telegram bot or API key needed.
 *
 * Channels:
 *   - beforeredalert: rocket/missile alerts → filtered by keywords
 *   - almogboker78: Almog Boker news/alerts → forwarded as-is
 */

// --- Channel configuration ---

interface ChannelConfig {
  /** Telegram channel username (used in URL) */
  name: string;
  /** Display label for WhatsApp messages */
  label: string;
  /** Emoji prefix for forwarded messages */
  emoji: string;
  /** If set, only forward messages containing one of these keywords */
  alertKeywords?: string[];
  /** Messages containing these are always excluded */
  excludeKeywords?: string[];
}

const CHANNELS: ChannelConfig[] = [
  {
    name: "beforeredalert",
    label: "beforeredalert",
    emoji: "🚨",
    alertKeywords: [
      "שיגור",
      "צבע אדום",
      "ירי רקטות",
      "התרעה",
      "כניסה למרחב מוגן",
      "יירוט",
      "טיל",
      "רקטה",
      "ירי לעבר",
      "יציאה",
      "יציאות",
      "התרחב",
    ],
    excludeKeywords: [
      "כניסה למבוגרים",
      "הסרטון כבר מסתובב",
      "תיעוד שלא היה אמור",
      "הלינק ימחק",
      "🔞",
    ],
  },
  {
    name: "almogboker78",
    label: "אלמוג בוקר",
    emoji: "📢",
    // No keyword filter — forward everything
    excludeKeywords: [
      "כניסה למבוגרים",
      "🔞",
      "הלינק ימחק",
    ],
  },
];

// --- State per channel ---

interface ChannelState {
  lastSeenId: number;
}

const channelState = new Map<string, ChannelState>();

const POLL_INTERVAL_MS = 15_000; // 15 seconds
let pollTimer: ReturnType<typeof setInterval> | null = null;
let notifyCallback: ((message: string) => Promise<void>) | null = null;

// --- Parsing ---

function parseMessages(html: string, channelName: string): Array<{ id: number; text: string }> {
  const results: Array<{ id: number; text: string }> = [];
  const escaped = channelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const msgPattern = new RegExp(
    `data-post="${escaped}/(\\d+)"[\\s\\S]*?class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
    "g"
  );
  let match;

  while ((match = msgPattern.exec(html)) !== null) {
    const id = parseInt(match[1], 10);
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text && id) {
      results.push({ id, text });
    }
  }

  return results;
}

// --- Filtering ---

function shouldForward(text: string, config: ChannelConfig): boolean {
  const lower = text.toLowerCase();

  // Always exclude
  if (config.excludeKeywords) {
    for (const kw of config.excludeKeywords) {
      if (lower.includes(kw.toLowerCase())) return false;
    }
  }

  // If no alert keywords defined, forward everything (news channel)
  if (!config.alertKeywords || config.alertKeywords.length === 0) {
    return true;
  }

  // Must match at least one alert keyword
  for (const kw of config.alertKeywords) {
    if (lower.includes(kw.toLowerCase())) return true;
  }

  return false;
}

// --- Poll single channel ---

async function checkChannel(config: ChannelConfig): Promise<void> {
  try {
    const url = `https://t.me/s/${config.name}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; alert-monitor/1.0)" },
    });

    if (!response.ok) {
      console.error(`[telegram] Failed to fetch ${config.name}: ${response.status}`);
      return;
    }

    const html = await response.text();
    const messages = parseMessages(html, config.name);
    if (messages.length === 0) return;

    let state = channelState.get(config.name);
    if (!state) {
      state = { lastSeenId: Math.max(...messages.map((m) => m.id)) };
      channelState.set(config.name, state);
      console.log(`[telegram] ${config.name} initialized, latest ID: ${state.lastSeenId}`);
      return;
    }

    const newMessages = messages.filter((m) => m.id > state!.lastSeenId);
    if (newMessages.length === 0) return;

    state.lastSeenId = Math.max(...newMessages.map((m) => m.id));

    const toForward = newMessages.filter((m) => shouldForward(m.text, config));

    for (const msg of toForward) {
      const cleanText = msg.text
        .replace(/🚨שתפו-https:\/\/t\.me\/\w+/g, "")
        .replace(/https:\/\/t\.me\/\w+/g, "")
        .trim();

      if (!cleanText) continue;

      const whatsappMsg = `${config.emoji} *${config.label}*\n${cleanText}`;

      console.log(`[telegram] ${config.emoji} ${config.name}: ${cleanText.substring(0, 80)}`);

      if (notifyCallback) {
        try {
          await notifyCallback(whatsappMsg);
        } catch (err) {
          console.error(`[telegram] Failed to forward from ${config.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`[telegram] Poll error for ${config.name}:`, err);
  }
}

// --- Poll all channels ---

async function checkAllChannels(): Promise<void> {
  for (const config of CHANNELS) {
    await checkChannel(config);
  }
}

/**
 * Start the Telegram channel poller.
 * @param onAlert callback to send message to owner via WhatsApp
 */
export function startAlertPoller(onAlert: (message: string) => Promise<void>): void {
  notifyCallback = onAlert;
  checkAllChannels();
  pollTimer = setInterval(checkAllChannels, POLL_INTERVAL_MS);
  console.log(`[telegram] Alert poller started (${CHANNELS.length} channels, every ${POLL_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop the alert poller.
 */
export function stopAlertPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[telegram] Alert poller stopped");
  }
}
