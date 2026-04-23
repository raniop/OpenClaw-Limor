/**
 * Telegram public channel poller for multiple channels.
 * Monitors public Telegram channels via web preview scraping.
 * No Telegram bot or API key needed.
 *
 * Channels are loaded from workspace/owner.json (telegramChannels).
 * A fresh install has no channels — the owner opts in explicitly.
 */
import { loadOwnerConfig, type TelegramChannel } from "../owner-config";

// Local alias so the rest of the file keeps its existing vocabulary.
type ChannelConfig = TelegramChannel;

function getChannels(): ChannelConfig[] {
  return loadOwnerConfig().telegramChannels;
}

// --- State per channel ---

interface ChannelState {
  lastSeenId: number;
  consecutiveFailures: number;
  pausedUntil: number; // timestamp — 0 means not paused
}

const channelState = new Map<string, ChannelState>();

const POLL_INTERVAL_MS = 15_000; // 15 seconds
let pollTimer: ReturnType<typeof setInterval> | null = null;
let notifyCallback: ((message: string) => Promise<void>) | null = null;
let notifyWithImageCallback: ((imageUrl: string, caption: string) => Promise<void>) | null = null;

// --- Parsing ---

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rlm;/g, "")   // right-to-left mark — strip it
    .replace(/&lrm;/g, "")   // left-to-right mark — strip it
    .replace(/&zwnj;/g, "")  // zero-width non-joiner — strip it
    .replace(/&zwj;/g, "")   // zero-width joiner — strip it
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-zA-Z]+;/g, ""); // catch any remaining named entities
}

/**
 * Convert Telegram HTML to WhatsApp-formatted text.
 * Preserves bold, italic, line breaks, and strips everything else.
 */
function htmlToWhatsApp(html: string): string {
  let text = html;
  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Convert bold
  text = text.replace(/<b>([\s\S]*?)<\/b>/gi, "*$1*");
  text = text.replace(/<strong>([\s\S]*?)<\/strong>/gi, "*$1*");
  // Convert italic
  text = text.replace(/<i>([\s\S]*?)<\/i>/gi, "_$1_");
  text = text.replace(/<em>([\s\S]*?)<\/em>/gi, "_$1_");
  // Convert underline (WhatsApp doesn't have underline, use bold)
  text = text.replace(/<u>([\s\S]*?)<\/u>/gi, "*$1*");
  // Convert code/monospace
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, "```$1```");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  // Clean up multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

function parseMessages(html: string, channelName: string): Array<{ id: number; text: string; imageUrl?: string }> {
  const results: Array<{ id: number; text: string; imageUrl?: string }> = [];
  const escaped = channelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Split HTML into individual message blocks
  const msgBlockPattern = new RegExp(
    `data-post="${escaped}/(\\d+)"([\\s\\S]*?)(?=data-post="${escaped}/\\d+"|$)`,
    "g"
  );
  let blockMatch;

  while ((blockMatch = msgBlockPattern.exec(html)) !== null) {
    const id = parseInt(blockMatch[1], 10);
    const block = blockMatch[2];

    // Extract text — preserve formatting for WhatsApp
    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = textMatch ? htmlToWhatsApp(textMatch[1]).trim() : "";

    // Extract photo URL from background-image
    const photoMatch = block.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
    const imageUrl = photoMatch ? photoMatch[1] : undefined;

    if ((text || imageUrl) && id) {
      results.push({ id, text, imageUrl });
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

/**
 * Fetch with timeout and single retry.
 * On first failure, waits 30s and retries once.
 */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await doFetch();
  } catch (_firstErr) {
    // Wait 30 seconds and retry once
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    return await doFetch();
  }
}

async function checkChannel(config: ChannelConfig): Promise<void> {
  let state = channelState.get(config.name);
  if (!state) {
    state = { lastSeenId: 0, consecutiveFailures: 0, pausedUntil: 0 };
    channelState.set(config.name, state);
  }

  // Circuit breaker — skip if paused
  if (state.pausedUntil && Date.now() < state.pausedUntil) {
    return;
  }

  try {
    const url = `https://t.me/s/${config.name}`;
    const response = await fetchWithRetry(url, {
      "User-Agent": "Mozilla/5.0 (compatible; alert-monitor/1.0)",
    });

    if (!response.ok) {
      console.error(`[telegram] Failed to fetch ${config.name}: ${response.status}`);
      return;
    }

    // Reset failures on success
    state.consecutiveFailures = 0;
    state.pausedUntil = 0;

    const html = await response.text();
    const messages = parseMessages(html, config.name);
    if (messages.length === 0) return;

    if (state.lastSeenId === 0) {
      state.lastSeenId = Math.max(...messages.map((m) => m.id));
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

      if (!cleanText && !msg.imageUrl) continue;

      const caption = `${config.emoji} *${config.label}*\n${cleanText}`;

      console.log(`[telegram] ${config.emoji} ${config.name}: ${cleanText.substring(0, 80)}${msg.imageUrl ? " [+image]" : ""}`);

      try {
        if (msg.imageUrl && notifyWithImageCallback) {
          await notifyWithImageCallback(msg.imageUrl, caption);
        } else if (notifyCallback) {
          await notifyCallback(caption);
        }
      } catch (err) {
        console.error(`[telegram] Failed to forward from ${config.name}:`, err);
      }
    }
  } catch (err: unknown) {
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1;

    if (state.consecutiveFailures >= 5) {
      state.pausedUntil = Date.now() + 5 * 60 * 1000;
      console.error(
        `[telegram] ${config.name} paused for 5 minutes after ${state.consecutiveFailures} consecutive failures`
      );
    } else if (state.consecutiveFailures === 1) {
      // Only log the first failure, not every 15 seconds
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] ${config.name} fetch failed: ${message}`);
    }
  }
}

// --- Poll all channels ---

async function checkAllChannels(): Promise<void> {
  for (const config of getChannels()) {
    await checkChannel(config);
  }
}

/**
 * Start the Telegram channel poller.
 * @param onAlert callback to send message to owner via WhatsApp
 */
export function startAlertPoller(
  onAlert: (message: string) => Promise<void>,
  onAlertWithImage?: (imageUrl: string, caption: string) => Promise<void>
): void {
  const channels = getChannels();
  if (channels.length === 0) {
    console.log("[telegram] Alert poller skipped — no telegramChannels configured in owner.json");
    return;
  }
  notifyCallback = onAlert;
  notifyWithImageCallback = onAlertWithImage || null;
  checkAllChannels();
  pollTimer = setInterval(checkAllChannels, POLL_INTERVAL_MS);
  console.log(`[telegram] Alert poller started (${channels.length} channels, every ${POLL_INTERVAL_MS / 1000}s, images: ${!!onAlertWithImage})`);
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
