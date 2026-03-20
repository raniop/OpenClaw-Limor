/**
 * Telegram public channel poller for rocket/missile alerts.
 * Monitors https://t.me/s/beforeredalert for launch alerts
 * and forwards them to the owner via WhatsApp.
 *
 * No Telegram bot needed — scrapes the public web preview.
 * Polls every 15 seconds for near-real-time alerts.
 */

const CHANNEL_URL = "https://t.me/s/beforeredalert";
const POLL_INTERVAL_MS = 15_000; // 15 seconds

// Keywords that indicate a real launch/alert (not spam or ads)
const ALERT_KEYWORDS = [
  "שיגור",
  "צבע אדום",
  "ירי רקטות",
  "התרעה",
  "כניסה למרחב מוגן",
  "יירוט",
  "טיל",
  "רקטה",
  "ירי לעבר",
];

// Keywords to EXCLUDE (spam, ads, links to other channels)
const EXCLUDE_KEYWORDS = [
  "כניסה למבוגרים",
  "הסרטון כבר מסתובב",
  "תיעוד שלא היה אמור",
  "הלינק ימחק",
  "🔞",
];

let lastSeenId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let notifyCallback: ((message: string) => Promise<void>) | null = null;

/**
 * Parse messages from the Telegram public channel HTML.
 */
function parseMessages(html: string): Array<{ id: number; text: string }> {
  const results: Array<{ id: number; text: string }> = [];

  // Match message blocks: data-post="beforeredalert/ID" ... message text
  const msgPattern = /data-post="beforeredalert\/(\d+)"[\s\S]*?class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let match;

  while ((match = msgPattern.exec(html)) !== null) {
    const id = parseInt(match[1], 10);
    // Strip HTML tags
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text && id) {
      results.push({ id, text });
    }
  }

  return results;
}

/**
 * Check if a message is a real alert (not spam/ad).
 */
function isAlertMessage(text: string): boolean {
  const lower = text.toLowerCase();

  // Exclude spam
  for (const exclude of EXCLUDE_KEYWORDS) {
    if (lower.includes(exclude.toLowerCase())) return false;
  }

  // Must contain an alert keyword
  for (const keyword of ALERT_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) return true;
  }

  return false;
}

/**
 * Fetch and check for new alerts.
 */
async function checkForAlerts(): Promise<void> {
  try {
    const response = await fetch(CHANNEL_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; alert-monitor/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`[telegram] Failed to fetch channel: ${response.status}`);
      return;
    }

    const html = await response.text();
    const messages = parseMessages(html);

    if (messages.length === 0) return;

    // On first run, just record the latest ID
    if (lastSeenId === 0) {
      lastSeenId = Math.max(...messages.map((m) => m.id));
      console.log(`[telegram] Initialized, latest message ID: ${lastSeenId}`);
      return;
    }

    // Find new messages since last check
    const newMessages = messages.filter((m) => m.id > lastSeenId);
    if (newMessages.length === 0) return;

    // Update last seen
    lastSeenId = Math.max(...newMessages.map((m) => m.id));

    // Filter for actual alerts
    const alerts = newMessages.filter((m) => isAlertMessage(m.text));

    for (const alert of alerts) {
      const cleanText = alert.text
        .replace(/🚨שתפו-https:\/\/t\.me\/beforeredalert/g, "")
        .replace(/https:\/\/t\.me\/beforeredalert/g, "")
        .trim();

      const whatsappMsg = `🚨 *התרעה!*\n${cleanText}\n\n_מקור: beforeredalert_`;

      console.log(`[telegram] 🚨 ALERT: ${cleanText.substring(0, 80)}`);

      if (notifyCallback) {
        try {
          await notifyCallback(whatsappMsg);
        } catch (err) {
          console.error("[telegram] Failed to send alert to owner:", err);
        }
      }
    }
  } catch (err) {
    console.error("[telegram] Poll error:", err);
  }
}

/**
 * Start the alert poller.
 * @param onAlert callback to send message to owner via WhatsApp
 */
export function startAlertPoller(onAlert: (message: string) => Promise<void>): void {
  notifyCallback = onAlert;

  // Initial check
  checkForAlerts();

  // Poll every 15 seconds
  pollTimer = setInterval(checkForAlerts, POLL_INTERVAL_MS);
  console.log("[telegram] Alert poller started (checking every 15s)");
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
