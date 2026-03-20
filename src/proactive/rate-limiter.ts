/**
 * Rate limiter for proactive messages.
 * Prevents spam by enforcing limits on outbound messages.
 */

const QUIET_HOURS_START = 22; // 10 PM
const QUIET_HOURS_END = 7;   // 7 AM
const MAX_DAILY_MESSAGES = 3;
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface ProactiveLog {
  timestamps: number[];
  lastUnanswered: boolean;
}

const log: ProactiveLog = {
  timestamps: [],
  lastUnanswered: false,
};

function isQuietHours(): boolean {
  const now = new Date();
  // Use Israel timezone
  const hour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" })
  );
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

function getTodayCount(): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return log.timestamps.filter(t => t >= todayStart.getTime()).length;
}

function getTimeSinceLastMessage(): number {
  if (log.timestamps.length === 0) return Infinity;
  return Date.now() - log.timestamps[log.timestamps.length - 1];
}

/**
 * Check if a proactive message can be sent.
 * Returns { allowed: boolean, reason: string }.
 */
export function canSendProactive(): { allowed: boolean; reason: string } {
  if (isQuietHours()) {
    return { allowed: false, reason: "quiet_hours" };
  }
  if (getTodayCount() >= MAX_DAILY_MESSAGES) {
    return { allowed: false, reason: "daily_limit" };
  }
  if (getTimeSinceLastMessage() < MIN_INTERVAL_MS) {
    return { allowed: false, reason: "too_soon" };
  }
  if (log.lastUnanswered) {
    return { allowed: false, reason: "last_unanswered" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Record that a proactive message was sent.
 */
export function recordProactiveSent(): void {
  log.timestamps.push(Date.now());
  log.lastUnanswered = true;
  // Clean old timestamps (keep last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  log.timestamps = log.timestamps.filter(t => t >= weekAgo);
}

/**
 * Record that the owner responded (resets unanswered flag).
 */
export function recordOwnerResponse(): void {
  log.lastUnanswered = false;
}
