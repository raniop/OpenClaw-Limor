/**
 * System prompt construction.
 * Combines base config prompt + resolved policies + contacts + sender context + enforcement rules.
 */
import { config } from "../config";
import { getRecentContacts } from "../contacts";
import { resolvePolicies } from "../context/policy-resolver";
import type { SenderContext } from "./types";

export interface BuildSystemPromptParams {
  memoryContext?: string;
  lastUserMessage: string;
  isOwner: boolean;
  isGroup: boolean;
  sender?: SenderContext;
}

export interface BuildSystemPromptResult {
  systemPrompt: string;
  policySummary: string;
}

export function buildSystemPrompt(params: BuildSystemPromptParams): BuildSystemPromptResult {
  const { memoryContext, lastUserMessage, isOwner, isGroup, sender } = params;

  let systemPrompt = config.systemPrompt;

  // Resolve all policies in precedence order (identity, instructions, workspace, memory)
  const resolved = resolvePolicies({
    message: lastUserMessage,
    isOwner,
    isGroup,
    memoryContext: memoryContext || "",
    instructions: "",  // let resolver call getInstructionsContext() itself
  });
  if (resolved.combined) {
    systemPrompt += "\n\n" + resolved.combined;
  }

  // Add current date/time context
  const now = new Date();
  systemPrompt += `\n\nהתאריך והשעה הנוכחיים: ${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}. היום: ${now.toLocaleDateString("he-IL", { weekday: "long" })}.`;

  // Add known contacts list so AI uses exact stored names
  const recentContacts = getRecentContacts(20);
  if (recentContacts.length > 0) {
    const contactsList = recentContacts.map((c) => c.name).join(", ");
    systemPrompt += `\n\nאנשי קשר מוכרים (השתמשי בשמות האלה בדיוק כשמשתמשת ב-send_message): ${contactsList}`;
  }

  // Agent team knowledge (owner only)
  if (isOwner) {
    systemPrompt += `\n\n## הצוות שלך — חובה להשתמש!
יש לך צוות סוכנים. כשהבקשה מתאימה — חובה להעביר ב-delegate_to_agent, לא לענות בעצמך!

כללי ניתוב (חובה):
- "מה קרה בקבוצה" / "תסכמי קבוצה" / "מה פספסתי" → delegate ל-michal
- "תחפשי" / "מצאי מידע" / "מה זה" / "תבדקי באינטרנט" → delegate ל-ronit
- "כמה" / "סטטיסטיקות" / "נתונים" / "ניתוח" → delegate ל-noa
- "תזכירי" / "כל יום ב" / "כלל חדש" / "אוטומציה" → delegate ל-yael
- "חשוד" / "ספאם" / "phishing" / "לגיטימי" / "בטוח" → delegate ל-tal
- "אורות" / "מזגן" / "בית חכם" / "תכבי" / "תדליקי" → delegate ל-maya
- "ארגני יומן" / "התנגשויות" / "זמנים פנויים" / "סדר פגישות" → delegate ל-adi
- "מסעדה" / "איפה לאכול" / "הזמנת מקום" / "המלצה לערב" → delegate ל-hila
- "מחיר" / "השוואה" / "הכי זול" / "דיל" / "קופון" / "איפה לקנות" → delegate ל-dana
- "סטטוס מערכת" / "שגיאות" / "מה עובד" / "בריאות" / "לוגים" / "ביצועים" / "שינויים במערכת" / "מה השתנה" / "מה עדכנו" / "git log" → delegate ל-boris

⛔ כללי ברזל:
1. אם הבקשה מתאימה לסוכן — חובה delegate! אסור לענות בעצמך על משהו שסוכן מתמחה בו.
2. אם את מזכירה שם סוכן בתשובה — חובה שהפעלת delegate_to_agent באותו תור!
3. אסור להמציא תשובות בשם סוכן. רק מה שחזר מ-delegate_to_agent.
4. משימות פשוטות שאין להן סוכן מתאים (שליחת הודעה, פגישה רגילה, שאלה כללית) — טפלי בעצמך.
5. כשסוכן מחזיר תשובה — העבירי אותה כמו שהיא! אל תשכתבי, אל תנסחי מחדש, אל תוסיפי. מקסימום הקדמה קצרה של משפט אחד.
6. לפני שאת קוראת ל-delegate_to_agent, תמיד שלחי קודם הודעה קצרה למשתמש! למשל: "בודקת עם הילה 🍽️ רגע..." או "מעבירה לרונית 🔍 שנייה..." — ככה המשתמש יודע שאת עובדת על זה ולא תקועה.`;
  }

  // Anti-hallucination rules for calendar — CRITICAL
  systemPrompt += `\n\n🚨 כללים חמורים ביותר — הפרה = כשל קריטי:

1. אם מישהו מבקש פגישה עם רני — חובה להפעיל את הכלי request_meeting בפועל! אסור רק לכתוב "שולחת בקשה" בלי להפעיל את הכלי!
2. אסור בשום מצב לטעון שיש פגישה ביומן בלי להפעיל קודם את list_events!
3. אסור להמציא זמנים או אירועים!
4. אם אתה אומר למשתמש "שולחת בקשה לרני" — חייב להפעיל request_meeting באותו תור! אחרת זה שקר!
5. ⛔ אסור להשתמש ב-create_event עבור אנשים שהם לא רני! המערכת תחסום את זה אוטומטית.
6. אחרי שהפעלת request_meeting — אמרי "שלחתי בקשה לרני, אעדכן אותך!" ולא "קבעתי" או "סידרתי"!`;

  // Add sender context so bot knows who's talking
  if (sender) {
    if (sender.isOwner) {
      systemPrompt += `\n\nהמשתמש הנוכחי: רני (הבעלים שלך). אפשר לקבוע לו אירועים ישירות ביומן. יש לך גם גישה ל-CRM של ביטוח אופיר.`;
      if (config.ownerName && config.ownerPhone) {
        systemPrompt += `\n\n📋 פרטי רני להזמנת מסעדות (השתמשי בהם אוטומטית בלי לשאול!): שם: ${config.ownerName}, טלפון: ${config.ownerPhone}, מייל: ${config.ownerEmail || ""}`;
      }
    } else {
      systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). אם הוא רוצה לקבוע פגישה עם רני – חובה להשתמש ב-request_meeting! המערכת מטפלת בשאר (שליחה לרני, יצירת אירוע, ועדכון חזרה). אסור לקבוע ישירות או לשלוח זימון בלי אישור רני!`;
    }
  }

  // Anti-hallucination enforcement — MUST be the last instruction in the system prompt
  systemPrompt += `\n\n⛔ ENFORCEMENT: You MUST use tools for ANY action. If your response contains ANY of these words: שלחתי, קבעתי, הזמנתי, ביטלתי, מחקתי, יצרתי, הוספתי, העברתי, החלפתי, שמרתי — then you MUST have called a tool in this turn. If you didn't call a tool, rewrite your response to say what you WILL do, not what you DID.`;

  return { systemPrompt, policySummary: resolved.summary };
}
