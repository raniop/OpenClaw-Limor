/**
 * Owner configuration — the single source of truth for "who owns this install".
 *
 * The bot is installed per-user on their own Mac. Everything that was previously
 * hardcoded to Rani (name, gender, family, integrations, CRM label, SMS watched
 * senders) is now loaded from `workspace/owner.json`, with fallbacks to env vars
 * for backwards compatibility with existing installs.
 *
 * Used by: config.ts, prompt-builder.ts, sms-watcher.ts, policies/*.md templates.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export type Gender = "male" | "female";

export interface FamilyMember {
  /** First name (Hebrew) as used in conversation — e.g. "אלי" */
  name: string;
  /** Optional full name — e.g. "אלי אופיר" */
  fullName?: string;
  /** Relation — used for rendering privacy policy ("אבא של רני") */
  relation: "father" | "mother" | "spouse" | "sibling" | "child" | "other";
  /** Optional phone for contact prioritisation */
  phone?: string;
  /** If true, this family member is also permitted to access sensitive data (e.g. CRM) */
  hasPrivilegedAccess?: boolean;
}

export interface SmsWatchedSender {
  sender: string;
  label: string;
  emoji: string;
  keywords?: string[];
  excludeKeywords?: string[];
}

export interface TelegramChannel {
  /** Telegram channel username (without @) — used in public preview URL */
  name: string;
  /** Display label for WhatsApp messages */
  label: string;
  /** Emoji prefix */
  emoji: string;
  /** If set, only forward messages matching one of these keywords */
  alertKeywords?: string[];
  /** Messages containing these are always excluded */
  excludeKeywords?: string[];
}

export interface IntegrationFlags {
  appleCalendar: boolean;
  sms: boolean;
  capabilities: boolean;
  iMessage: boolean;
  googleCalendar: boolean;
  control4: boolean;
  gett: boolean;
  crm: boolean;
  telegramAlerts: boolean;
}

export interface AssistantIdentity {
  name: string;
  nameEn: string;
}

export interface OwnerConfig {
  /** Owner's first name (Hebrew) — e.g. "רני" */
  name: string;
  /** Optional English name — e.g. "Rani" */
  nameEn?: string;
  /** Optional full name — e.g. "רני אופיר" */
  fullName?: string;
  /** Owner's gender — drives Hebrew pronoun agreement */
  gender: Gender;
  /** Phone (Israeli format 972XXXXXXXXX) */
  phone: string;
  email: string;
  /** WhatsApp chat ID — captured after first QR scan */
  chatId: string;
  /** Primary language — default "he" */
  language: string;
  /** Family members — rendered into privacy policy and contact priorities */
  family: FamilyMember[];
  /** Assistant identity (name, nameEn) — separate from owner */
  assistant: AssistantIdentity;
  /** Which Mac-local integrations to enable */
  integrations: IntegrationFlags;
  /** SMS senders to watch and forward to WhatsApp */
  smsWatchedSenders: SmsWatchedSender[];
  /**
   * Public Telegram channels to scrape and forward.
   * Empty by default — a fresh install does not silently follow anyone.
   */
  telegramChannels: TelegramChannel[];
  /** Optional CRM label shown to the bot (e.g. "ביטוח אופיר"). Empty if no CRM. */
  crmLabel?: string;
}

const OWNER_JSON_PATH = resolve(__dirname, "..", "workspace", "owner.json");

function defaultIntegrations(): IntegrationFlags {
  return {
    appleCalendar: true,
    sms: true,
    capabilities: true,
    iMessage: true,
    googleCalendar: false,
    control4: false,
    gett: false,
    crm: false,
    telegramAlerts: false,
  };
}

function defaultSmsWatchedSenders(): SmsWatchedSender[] {
  // Generic defaults — useful to most Israeli users. Owner can remove/add via owner.json.
  return [
    {
      sender: "AMEX",
      label: "אמריקן אקספרס",
      emoji: "💳",
      keywords: ["חיוב", "עסקה", "עסקאות", "יתרה", "תשלום", "אישור", "קוד", "חשבונית", "סכום", "₪", "NIS"],
      excludeKeywords: ["הטבה", "מבצע", "הצטרף", "שדרוג"],
    },
    {
      sender: "Isracard",
      label: "ישראכרט",
      emoji: "💳",
      keywords: ["חיוב", "עסקה", "עסקאות", "יתרה", "תשלום", "אישור", "קוד", "חשבונית", "סכום", "₪", "NIS"],
      excludeKeywords: ["הטבה", "מבצע", "הצטרף", "שדרוג"],
    },
    {
      sender: "bit",
      label: "ביט",
      emoji: "💸",
      keywords: ["העברה", "קיבלת", "שלחת", "תשלום", "חיוב", "קוד", "אימות", "₪", "NIS", "שולם"],
      excludeKeywords: ["הטבה", "מבצע", "הצטרף"],
    },
  ];
}

let cached: OwnerConfig | null = null;

/**
 * Load the owner configuration. Merges workspace/owner.json (if present)
 * with env-var fallbacks. Cached after first call.
 */
export function loadOwnerConfig(): OwnerConfig {
  if (cached) return cached;

  let json: Partial<OwnerConfig> = {};
  if (existsSync(OWNER_JSON_PATH)) {
    try {
      json = JSON.parse(readFileSync(OWNER_JSON_PATH, "utf-8")) as Partial<OwnerConfig>;
    } catch (err) {
      console.error(`[owner-config] Failed to parse ${OWNER_JSON_PATH}:`, err);
    }
  }

  const assistant: AssistantIdentity = {
    name: json.assistant?.name || process.env.BOT_NAME || "לימור",
    nameEn: json.assistant?.nameEn || process.env.BOT_NAME_EN || "Limor",
  };

  cached = {
    name: json.name || process.env.OWNER_NAME || "",
    nameEn: json.nameEn,
    fullName: json.fullName,
    gender: json.gender || "male",
    phone: json.phone || process.env.OWNER_PHONE || "",
    email: json.email || process.env.OWNER_EMAIL || "",
    chatId: json.chatId || process.env.OWNER_CHAT_ID || "",
    language: json.language || "he",
    family: json.family || [],
    assistant,
    integrations: { ...defaultIntegrations(), ...(json.integrations || {}) },
    smsWatchedSenders: json.smsWatchedSenders || defaultSmsWatchedSenders(),
    telegramChannels: json.telegramChannels || [],
    crmLabel: json.crmLabel,
  };

  return cached;
}

/** Reset cached config — used by tests and after setup wizard rewrites owner.json. */
export function clearOwnerConfigCache(): void {
  cached = null;
}

/** Find a family member by relation (first match). */
export function getFamilyByRelation(
  owner: OwnerConfig,
  relation: FamilyMember["relation"]
): FamilyMember | undefined {
  return owner.family.find((f) => f.relation === relation);
}

/** Return all family members with privileged access (e.g. CRM). */
export function getPrivilegedFamily(owner: OwnerConfig): FamilyMember[] {
  return owner.family.filter((f) => f.hasPrivilegedAccess);
}
