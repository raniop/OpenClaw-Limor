/**
 * Operational Rules Engine — structured rules that control autonomous subsystem behavior.
 *
 * Unlike instructions.json (which only affects AI conversations), operational rules
 * are checked by autonomous subsystems (email poller, SMS watcher, delivery poller,
 * proactive engine, agents) before they take action.
 *
 * When the owner says "don't forward Apple receipts" — the AI creates an operational rule,
 * and the email poller actually stops forwarding Apple receipts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "./state-dir";
import { config } from "./config";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RuleSubsystem = "email" | "sms" | "delivery" | "proactive" | "agents" | "*";
export type RuleAction = "block" | "allow" | "mute";

export interface RuleConditions {
  vendor?: string;          // e.g., "Apple", "Amazon", "Wolt" (case-insensitive)
  sender?: string;          // e.g., "HAREL", "OPHIR" (for SMS)
  emailType?: string;       // "receipt" | "order" | "flight" | "hotel" | "booking" | "subscription"
  proactiveType?: string;   // "morning_summary" | "followup_reminder" | "pre_meeting"
  agentId?: string;         // "amit" | "boris" | "michal"
  keyword?: string;         // freeform keyword match on message content
}

export interface OperationalRule {
  id: string;
  subsystem: RuleSubsystem;
  action: RuleAction;
  conditions: RuleConditions;
  expiresAt?: string;       // ISO timestamp — undefined = permanent
  description: string;      // Hebrew description
  rawInput: string;         // Original owner message
  createdAt: string;        // ISO timestamp
  enabled: boolean;
}

interface OperationalRulesStore {
  version: 1;
  rules: OperationalRule[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RULES = 100;
const CACHE_TTL_MS = 30_000; // 30 seconds — balances SMS watcher (10s) vs freshness
const RULES_FILE = "operational-rules.json";

// ─── Cache ──────────────────────────────────────────────────────────────────

let _cache: { store: OperationalRulesStore; loadedAt: number } | null = null;

function invalidateCache(): void {
  _cache = null;
}

// ─── Storage ────────────────────────────────────────────────────────────────

function loadStore(): OperationalRulesStore {
  // Return from cache if fresh
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache.store;
  }

  const filePath = statePath(RULES_FILE);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let store: OperationalRulesStore;

  if (existsSync(filePath)) {
    try {
      store = JSON.parse(readFileSync(filePath, "utf-8")) as OperationalRulesStore;
    } catch {
      store = { version: 1, rules: [] };
    }
  } else {
    store = { version: 1, rules: [] };
  }

  // Prune expired rules on load
  const now = Date.now();
  const before = store.rules.length;
  store.rules = store.rules.filter(
    (r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now
  );
  if (store.rules.length < before) {
    saveStoreDirect(store);
    console.log(`[rules] Pruned ${before - store.rules.length} expired rules`);
  }

  // Cache it
  _cache = { store, loadedAt: Date.now() };
  return store;
}

function saveStoreDirect(store: OperationalRulesStore): void {
  const filePath = statePath(RULES_FILE);
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

function saveStore(store: OperationalRulesStore): void {
  saveStoreDirect(store);
  invalidateCache();
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addRule(params: {
  subsystem: RuleSubsystem;
  action: RuleAction;
  conditions: RuleConditions;
  description: string;
  rawInput: string;
  expiresAt?: string;
}): OperationalRule {
  const store = loadStore();

  const rule: OperationalRule = {
    id: generateId(),
    subsystem: params.subsystem,
    action: params.action,
    conditions: params.conditions,
    description: params.description,
    rawInput: params.rawInput,
    expiresAt: params.expiresAt,
    createdAt: new Date().toISOString(),
    enabled: true,
  };

  store.rules.push(rule);

  // Trim to max
  if (store.rules.length > MAX_RULES) {
    store.rules = store.rules.slice(-MAX_RULES);
  }

  saveStore(store);
  console.log(`[rules] Added: ${rule.id} — ${rule.description}`);
  return rule;
}

export function removeRule(query: string): string {
  const store = loadStore();

  // Try by ID
  let idx = store.rules.findIndex((r) => r.id === query);

  // Try by 1-indexed number
  if (idx === -1) {
    const num = parseInt(query, 10);
    if (!isNaN(num) && num >= 1 && num <= store.rules.length) {
      idx = num - 1;
    }
  }

  // Try by text search in description
  if (idx === -1) {
    idx = store.rules.findIndex(
      (r) =>
        r.description.includes(query) ||
        query.includes(r.description) ||
        (r.conditions.vendor && r.conditions.vendor.toLowerCase().includes(query.toLowerCase())) ||
        (r.conditions.sender && r.conditions.sender.toLowerCase().includes(query.toLowerCase()))
    );
  }

  if (idx !== -1) {
    const removed = store.rules.splice(idx, 1)[0];
    saveStore(store);
    console.log(`[rules] Removed: ${removed.id} — ${removed.description}`);
    return `✅ הסרתי כלל: "${removed.description}"`;
  }

  return `❌ לא מצאתי כלל שמתאים ל-"${query}"`;
}

export function toggleRule(id: string, enabled: boolean): string {
  const store = loadStore();
  const rule = store.rules.find((r) => r.id === id);
  if (!rule) return `❌ לא מצאתי כלל ${id}`;

  rule.enabled = enabled;
  saveStore(store);
  return `✅ ${enabled ? "הפעלתי" : "השבתתי"} כלל: "${rule.description}"`;
}

export function listRules(subsystem?: RuleSubsystem): OperationalRule[] {
  const store = loadStore();
  if (subsystem) {
    return store.rules.filter((r) => r.subsystem === subsystem || r.subsystem === "*");
  }
  return store.rules;
}

// ─── Query API — used by autonomous subsystems ──────────────────────────────

function getActiveRules(subsystem: RuleSubsystem): OperationalRule[] {
  const store = loadStore();
  const now = Date.now();
  return store.rules.filter(
    (r) =>
      r.enabled &&
      (!r.expiresAt || new Date(r.expiresAt).getTime() > now) &&
      (r.subsystem === subsystem || r.subsystem === "*")
  );
}

function matchesConditions(rule: OperationalRule, context: Partial<RuleConditions>): boolean {
  const c = rule.conditions;

  // Each condition field uses AND logic — all specified conditions must match
  if (c.vendor && context.vendor) {
    if (!context.vendor.toLowerCase().includes(c.vendor.toLowerCase())) return false;
  } else if (c.vendor && !context.vendor) {
    return false; // Rule requires vendor but context doesn't have one
  }

  if (c.sender && context.sender) {
    if (!context.sender.toLowerCase().includes(c.sender.toLowerCase())) return false;
  } else if (c.sender && !context.sender) {
    return false;
  }

  if (c.emailType && context.emailType) {
    if (c.emailType.toLowerCase() !== context.emailType.toLowerCase()) return false;
  } else if (c.emailType && !context.emailType) {
    return false;
  }

  if (c.proactiveType && context.proactiveType) {
    if (c.proactiveType !== context.proactiveType) return false;
  } else if (c.proactiveType && !context.proactiveType) {
    return false;
  }

  if (c.agentId && context.agentId) {
    if (c.agentId.toLowerCase() !== context.agentId.toLowerCase()) return false;
  } else if (c.agentId && !context.agentId) {
    return false;
  }

  if (c.keyword && context.keyword) {
    if (!context.keyword.toLowerCase().includes(c.keyword.toLowerCase())) return false;
  } else if (c.keyword && !context.keyword) {
    return false;
  }

  return true;
}

/**
 * Find the first matching rule for a subsystem and context.
 * Returns the matching rule, or null if no rules match.
 */
export function findMatchingRule(
  subsystem: RuleSubsystem,
  context: Partial<RuleConditions>
): OperationalRule | null {
  const rules = getActiveRules(subsystem);

  // Check "allow" rules first — they override blocks
  for (const rule of rules) {
    if (rule.action === "allow" && matchesConditions(rule, context)) {
      return rule;
    }
  }

  // Then check "block" and "mute" rules
  for (const rule of rules) {
    if ((rule.action === "block" || rule.action === "mute") && matchesConditions(rule, context)) {
      return rule;
    }
  }

  return null;
}

// ─── Convenience functions for each subsystem ───────────────────────────────

/**
 * Should this email notification be forwarded?
 * Returns true = forward, false = blocked by rule.
 */
export function shouldForwardEmail(vendor: string, type: string): boolean {
  const rule = findMatchingRule("email", { vendor, emailType: type });
  if (!rule) return true; // No matching rule → default: forward
  return rule.action === "allow"; // allow → forward, block/mute → don't
}

/**
 * Should this SMS from the given sender be forwarded?
 */
export function shouldForwardSMS(sender: string): boolean {
  const rule = findMatchingRule("sms", { sender });
  if (!rule) return true;
  return rule.action === "allow";
}

/**
 * Should this delivery alert be forwarded?
 */
export function shouldForwardDelivery(carrier: string, summary?: string): boolean {
  const rule = findMatchingRule("delivery", { vendor: carrier, keyword: summary });
  if (!rule) return true;
  return rule.action === "allow";
}

/**
 * Should this proactive message be sent?
 */
export function shouldSendProactive(type: string): boolean {
  const rule = findMatchingRule("proactive", { proactiveType: type });
  if (!rule) return true;
  return rule.action === "allow";
}

/**
 * Should this autonomous agent run?
 */
export function shouldRunAgent(agentId: string): boolean {
  const rule = findMatchingRule("agents", { agentId });
  if (!rule) return true;
  return rule.action === "allow";
}

// ─── Context for AI prompt ──────────────────────────────────────────────────

/**
 * Returns formatted text of active operational rules for inclusion in the AI prompt.
 * This lets the AI know what rules are active and answer questions about them.
 */
export function getActiveRulesContext(): string {
  const store = loadStore();
  const now = Date.now();
  const active = store.rules.filter(
    (r) => r.enabled && (!r.expiresAt || new Date(r.expiresAt).getTime() > now)
  );

  if (active.length === 0) return "";

  const actionLabel: Record<RuleAction, string> = {
    block: "🚫 חסום",
    allow: "✅ מותר",
    mute: "🔇 מושתק",
  };

  const subsystemLabel: Record<RuleSubsystem, string> = {
    email: "מיילים",
    sms: "SMS",
    delivery: "משלוחים",
    proactive: "הודעות פרואקטיביות",
    agents: "סוכנים",
    "*": "כל המערכות",
  };

  const lines: string[] = [];
  lines.push(`## כללים תפעוליים פעילים (${active.length})`);
  lines.push(`הכללים הבאים משפיעים על ההתנהגות האוטומטית של המערכת:`);

  for (const rule of active) {
    const expiry = rule.expiresAt ? ` (עד ${new Date(rule.expiresAt).toLocaleDateString("he-IL")})` : " (לצמיתות)";
    lines.push(`- ${actionLabel[rule.action]} [${subsystemLabel[rule.subsystem]}]: ${rule.description}${expiry}`);
  }

  return lines.join("\n");
}

// ─── Duration helper ────────────────────────────────────────────────────────

/**
 * Compute expiration timestamp from a duration string.
 * Returns ISO string, or undefined for "permanent".
 */
export function computeExpiry(duration?: string): string | undefined {
  if (!duration || duration === "permanent") return undefined;

  const now = new Date();

  // Compute in Israel timezone
  const israelFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = israelFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "0";

  switch (duration) {
    case "today": {
      // End of today in Israel time
      const endOfDay = new Date(now);
      const currentHour = parseInt(getPart("hour"), 10);
      const hoursLeft = 23 - currentHour;
      endOfDay.setHours(endOfDay.getHours() + hoursLeft, 59, 59, 999);
      return endOfDay.toISOString();
    }
    case "this_week": {
      // End of Saturday (Israel week ends on Saturday)
      const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
      const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilSaturday);
      endOfWeek.setHours(23, 59, 59, 999);
      return endOfWeek.toISOString();
    }
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case "3h":
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    case "12h":
      return new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

/**
 * Format a list of rules for display.
 */
export function formatRulesList(subsystem?: RuleSubsystem): string {
  const rules = listRules(subsystem);
  if (rules.length === 0) return "אין כללים תפעוליים פעילים.";

  const actionEmoji: Record<RuleAction, string> = { block: "🚫", allow: "✅", mute: "🔇" };
  const subsystemLabel: Record<RuleSubsystem, string> = {
    email: "מיילים", sms: "SMS", delivery: "משלוחים",
    proactive: "פרואקטיבי", agents: "סוכנים", "*": "הכל",
  };

  return rules
    .map((r, i) => {
      const status = r.enabled ? actionEmoji[r.action] : "⏸️";
      const expiry = r.expiresAt
        ? ` ⏰ עד ${new Date(r.expiresAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
        : " ♾️";
      return `${i + 1}. ${status} [${subsystemLabel[r.subsystem]}] ${r.description}${expiry}`;
    })
    .join("\n");
}
