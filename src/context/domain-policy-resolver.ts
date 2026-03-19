/**
 * Domain Policy Resolver — Phase 16: deterministic domain-specific policies.
 * Applies stricter, smarter rules depending on the active domain of the turn.
 * No AI calls, no DB, pure deterministic logic.
 */
import type { ResolvedContext, DomainPolicy, DomainType } from "./context-types";

const DOMAIN_RULES: Record<DomainType, string[]> = {
  general: [
    "להשיב בצורה ישירה וקצרה לפי האסטרטגיה שנבחרה",
    "לא לבצע פעולה בלי צורך ברור",
  ],
  messaging: [
    "לא לשלוח הודעה בלי נמען ברור",
    "אם חסר נמען או יש ambiguity — לבקש הבהרה",
    "אם יש כלי שליחה מותר, להתקדם רק אחרי אישור הקשר ברור",
  ],
  calendar: [
    "לא לקבוע בלי תאריך/שעה או נושא ברורים",
    "אם חסר פרט מהותי — לבקש הבהרה לפני ביצוע",
    "אם הבקשה ברורה, להעדיף ביצוע מסודר וקצר",
  ],
  crm: [
    "להעדיף דיוק על פני מהירות",
    "לא להסיק פרטי פוליסה בלי בסיס ברור",
    "אם יש חוסר מידע — לשאול שאלה ממוקדת",
  ],
  booking: [
    "לא לבצע הזמנה בלי מספיק פרטי הזמנה",
    "אם חסרים תאריך/שעה/מספר סועדים — לבקש הבהרה",
    "אם יש העדפת משתמש שמורה, אפשר להתחשב בה",
  ],
  travel: [
    "לא לחפש בלי יעד או מסגרת זמן כשנדרש",
    "אם הבקשה כללית מדי — לבקש מיקוד",
    "אם הבקשה ברורה, להתקדם לחיפוש",
  ],
};

const DOMAIN_SUMMARIES: Record<DomainType, string> = {
  general: "מדיניות כללית",
  messaging: "מדיניות הודעות",
  calendar: "מדיניות יומן",
  crm: "מדיניות CRM",
  booking: "מדיניות הזמנות",
  travel: "מדיניות נסיעות",
};

const DOMAIN_REASONS: Record<DomainType, string> = {
  general: "לא זוהתה כוונת דומיין מיוחדת",
  messaging: "זוהתה כוונת שליחת הודעה",
  calendar: "זוהתה בקשת תיאום או יומן",
  crm: "זוהתה בקשת CRM/פוליסה",
  booking: "זוהתה בקשת הזמנה",
  travel: "זוהתה בקשת נסיעה/חיפוש",
};

/** Map from toolIntent.type to DomainType (only for recognized domains). */
const TOOL_TO_DOMAIN: Record<string, DomainType> = {
  messaging: "messaging",
  calendar: "calendar",
  crm: "crm",
  booking: "booking",
  travel: "travel",
};

/**
 * Resolve the domain policy for this turn based on tool intent.
 */
export function resolveDomainPolicy(
  resolved: Omit<ResolvedContext, "domainPolicy">
): DomainPolicy {
  const domain: DomainType = TOOL_TO_DOMAIN[resolved.toolIntent.type] || "general";

  return {
    domain,
    summary: DOMAIN_SUMMARIES[domain],
    reason: DOMAIN_REASONS[domain],
    confidence: domain === "general" ? 0.7 : 0.9,
    rules: DOMAIN_RULES[domain],
  };
}
