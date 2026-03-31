/**
 * Tool Intent Resolver — determines if this turn likely needs a tool call.
 * Deterministic pattern matching, no AI calls.
 */
import { config } from "../config";
import type { ContextBundle, PrimaryFocus, ResponseMode, ActionPlan, ToolIntent } from "./context-types";

interface ToolIntentInput {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
}

const MESSAGING_VERBS = /(תשלחי|תכתבי|תגידי\s+ל|תעני\s+ל|תעבירי|send\b|forward)/i;
const CALENDAR_PATTERNS = /(תקבעי|תתאמי|ביומן|פגישה|זימון|calendar|meeting|לתאם|לקבוע|נקבע|נעשה מחדש|שיחה עם|לדבר עם|פנוי ב|פנוי מחר|מתי (פנוי|נוח|אפשר)|נפגש|להיפגש)/i;
const BOOKING_PATTERNS = /(מסעדה|להזמין מקום|שולחן|booking|book restaurant)/i;
const TRAVEL_PATTERNS = /(טיסה|מלון|חופשה|flight|hotel)/i;
const CRM_PATTERNS = /(פוליסה|ביטוח|לקוח|crm|policy|insurance)/i;
const FILE_PATTERNS = /(קובץ|מסמך|לשמור|למחוק קובץ|file|document)/i;
const CONTACT_PATTERNS = /(איש קשר|מספר של|טלפון של|contact|אנשי קשר|תוסיפי את|תוסיף את|vcard|vcf|BEGIN:VCARD)/i;
const VCARD_PATTERN = /^[A-Za-zא-ת\s\-\.]+\n\+?9725\d{8}/;
const CAPABILITY_PATTERNS = /(תלמדי|תלמד|capability|יכולת חדשה)/i;
const INSTRUCTION_PATTERNS = /(צריך לזהות|צריכה לזהות|תזכרי ש|תזכור ש|תלמדי ש|תלמד ש|מעכשיו תמיד|מעכשיו כש|learn.*instruction|save.*instruction|תשמרי.*הוראה|הוראה חדשה|כלל חדש|תתייחסי ל.*כ|זה (ג'?אנק|ספאם|spam|junk)|תתעלמי מ|תפסיקי ל|אל ת.*יותר)/i;
const GROUP_HISTORY_PATTERNS = /(תסכמי.*קבוצ|תסכם.*קבוצ|מה היה ב.*קבוצ|מה קורה ב.*קבוצ|מה פספסתי ב.*קבוצ|מה קרה ב.*קבוצ|סיכום.*קבוצ|summary.*group|what happened.*group|מה דיברו ב|מה אמרו ב|היסטורי.*קבוצ|group.*history)/i;
const WHATSAPP_MGMT_PATTERNS = /(מי בקבוצ|חברי הקבוצ|רשימת.*קבוצ|group members|תמחקי.*הודע|תערכי.*הודע|edit message|delete message|תחפשי.*הודע|search messages|סקר|poll|תצמידי|pin|נקרא|read status|תבדקי.*מספר|check.*number|בוואטסאפ|label|תייגי|תוסיפי.*לקבוצ|תסירי.*מקבוצ|מי שם\??)/i;
const SMS_PATTERNS = /(sms|הודעות טקסט|הודעות רגילות|הודעות באייפון|חבילה|חבילות|משלוח|משלוחים|deliveries?|packages?|מה הגיע|מה קיבלתי)/i;
const OFFICE_PC_PATTERNS = /(מחשב.*משרד|מחשב.*עבודה|דסקטופ|desktop|לוגאין|login|unlock|נעילה|תיכנסי.*מחשב|תפתחי.*מחשב|המחשב עף|המחשב נפל|office.?pc|חבר.*אותי)/i;
const HEALTH_PATTERNS = /(בריאות|צעדים|steps|קלוריות|calories|דופק|heart.?rate|שעון.*חכם|apple.*health|נתוני.*בריאות)/i;
const DELEGATION_PATTERNS = /(תבדקי|תסדרי|תנסי|תחפשי|תסתכלי|סטטוס.*מערכת|שגיאות|לוגים|מה עובד|מה לא עובד|תפעילי|תכבי|תפתחי.*פיצ׳ר|תממשי|תתקני.*באג|תכתבי.*קוד)/i;
const SELF_AWARENESS_PATTERNS = /(מה הסטטוס שלך|איך את עובדת|מה המדדים|מה הביצועים|יש בעיות|כמה הזיות|דיוק כלים|מה את יודעת|מה את לא יודעת|תבדקי את עצמך)/i;

/**
 * Resolve whether a tool is likely needed based on message content and context.
 */
export function resolveToolIntent(resolved: ToolIntentInput): ToolIntent {
  const message = resolved.bundle.conversation.lastUserMessage;
  const needsClarification = resolved.actionPlan.needsClarification;

  // Check current message first, then recent conversation context for multi-turn intent
  let match = matchToolCategory(message);

  // If no match on last message, check assistant's last response for ongoing intent
  // (e.g., bot said "שולחת בקשה לרני! פגישה היום..." and user replies "היום ב-17:00")
  if (!match && resolved.bundle.conversation.lastAssistantMessage) {
    const contextText = resolved.bundle.conversation.lastAssistantMessage;
    match = matchToolCategory(contextText);
  }

  if (!match) {
    return {
      type: "none",
      shouldUseTool: false,
      summary: "אין צורך בכלי",
      reason: "אפשר לענות ישירות",
      confidence: 0.7,
    };
  }

  // Even if clarification might be needed, still allow tools —
  // let the AI decide whether to clarify or proceed.
  // Previously this blocked tools, causing Limor to ask unnecessary questions.

  return {
    type: match.type,
    shouldUseTool: true,
    summary: `סביר שנדרש כלי ${match.label}`,
    reason: match.reason,
    confidence: match.confidence,
  };
}

interface ToolMatch {
  type: ToolIntent["type"];
  label: string;
  reason: string;
  confidence: number;
}

function matchToolCategory(message: string): ToolMatch | null {
  if (MESSAGING_VERBS.test(message)) {
    return { type: "messaging", label: "שליחת הודעה", reason: "יש בקשת שליחה", confidence: 0.9 };
  }
  if (CALENDAR_PATTERNS.test(message)) {
    return { type: "calendar", label: "יומן", reason: "יש בקשת תיאום או פגישה", confidence: 0.9 };
  }
  if (BOOKING_PATTERNS.test(message)) {
    return { type: "booking", label: "הזמנת מקום", reason: "יש בקשת הזמנה", confidence: 0.9 };
  }
  if (TRAVEL_PATTERNS.test(message)) {
    return { type: "travel", label: "נסיעות", reason: "יש בקשת טיסה או מלון", confidence: 0.85 };
  }
  if (CRM_PATTERNS.test(message)) {
    return { type: "crm", label: "CRM", reason: "יש שאלה על פוליסה או לקוח", confidence: 0.9 };
  }
  if (FILE_PATTERNS.test(message)) {
    return { type: "file", label: "קבצים", reason: "יש בקשה הקשורה לקבצים", confidence: 0.85 };
  }
  if (SMS_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "SMS/הודעות", reason: "יש בקשת קריאת SMS או בדיקת חבילות", confidence: 0.9 };
  }
  if (CONTACT_PATTERNS.test(message) || VCARD_PATTERN.test(message)) {
    return { type: "contact_lookup", label: "אנשי קשר", reason: "יש בקשת חיפוש או הוספת איש קשר", confidence: 0.9 };
  }
  if (INSTRUCTION_PATTERNS.test(message)) {
    return { type: "file", label: "הוראה/למידה", reason: `הוראה או כלל חדש ל${config.botName}`, confidence: 0.85 };
  }
  if (GROUP_HISTORY_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "היסטוריית קבוצה", reason: "בקשת סיכום או היסטוריה של קבוצה", confidence: 0.9 };
  }
  if (CAPABILITY_PATTERNS.test(message)) {
    return { type: "capability", label: "יכולות", reason: "יש בקשת יכולת חדשה", confidence: 0.85 };
  }
  if (WHATSAPP_MGMT_PATTERNS.test(message)) {
    return { type: "whatsapp_management", label: "ניהול וואטסאפ", reason: "יש בקשה הקשורה לניהול וואטסאפ", confidence: 0.9 };
  }
  if (OFFICE_PC_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "מחשב משרד", reason: "בקשה הקשורה למחשב המשרד", confidence: 0.9 };
  }
  if (HEALTH_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "בריאות", reason: "שאלה על נתוני בריאות", confidence: 0.85 };
  }
  if (DELEGATION_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "משימה לסוכן", reason: "בקשת פעולה שדורשת סוכן", confidence: 0.85 };
  }
  if (SELF_AWARENESS_PATTERNS.test(message)) {
    return { type: "contact_lookup", label: "בדיקה עצמית", reason: "בקשת סטטוס או מדדי ביצועים", confidence: 0.9 };
  }
  return null;
}
