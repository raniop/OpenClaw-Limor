/**
 * Response Guidance Generator — produces 1-3 Hebrew directives for the AI.
 * Turns raw context state into actionable instructions.
 */
import type { ContextBundle } from "./context-types";

/**
 * Generate response guidance directives based on the full context bundle.
 * Returns 1-3 short Hebrew instruction strings for injection into the AI prompt.
 */
export function generateResponseGuidance(bundle: ContextBundle): string[] {
  const guidance: string[] = [];
  const { turnIntent, openLoops, urgency, conversation, person } = bundle;

  // 1. Overdue followup — always surface, highest priority
  if (urgency.isOverdue && openLoops.followups.length > 0) {
    const overdue = openLoops.followups.find((f) => f.isOverdue);
    if (overdue) {
      const reason = truncate(overdue.reason, 80);
      guidance.push(`⚠️ יש משימה שעבר הזמן שלה: "${reason}" — תציפי ותציעי לטפל.`);
    }
  }

  // 2. Minimal message + open loops → user probably asking about pending items
  if (turnIntent.isMinimal && openLoops.followups.length > 0 && !urgency.isOverdue) {
    guidance.push("המשתמש שלח הודעה קצרה — כנראה שואל על דברים פתוחים. תעדכני אותו.");
  }

  // 3. Correction intent — don't create new, update existing
  if (turnIntent.category === "correction") {
    guidance.push("המשתמש מתקן משהו — עדכני את הרשומה הקיימת, אל תיצרי חדשה.");
  }

  // 4. Repeated unanswered messages — acknowledge everything
  if (conversation.repeatedRecentMessages) {
    guidance.push("שימי לב: כמה הודעות בלי מענה — תני תשובה שמכסה את כל מה ששאל.");
  }

  // 5. Status query — structured overview
  if (turnIntent.category === "status_query") {
    guidance.push("המשתמש שואל מה הסטטוס — תני סיכום קצר וממוקד של כל מה שפתוח.");
  }

  // 6. Greeting + open items — mention open items after greeting
  if (turnIntent.category === "greeting" && openLoops.followups.length > 0) {
    guidance.push("אחרי הברכה, תזכירי בקצרה מה פתוח.");
  }

  // 7. Followup query — direct answer about the specific item
  if (turnIntent.category === "followup_query" && openLoops.followups.length > 0) {
    guidance.push("המשתמש שואל על משהו ספציפי — בדקי אם זה קשור ל-followup הפתוח ועני ישירות.");
  }

  // 8. Important contact + long wait — be attentive
  if (person.importanceScore >= 70 && urgency.waitingTimeMinutes > 120 && !urgency.isOverdue) {
    guidance.push("לקוח חשוב שמחכה — תני תשובה ישירה ומקצועית.");
  }

  // 9. Multi-step request — guide the AI to plan and execute
  if (turnIntent.category === "multi_step_request") {
    guidance.push("🔗 זו בקשה מורכבת — תכנני את השלבים, ספרי למשתמש מה את עומדת לעשות, ותבצעי שלב אחרי שלב. דווחי התקדמות.");
  }

  // 10. Mood-aware directives
  const { mood } = bundle;
  if (mood.confidence >= 0.6 && mood.mood !== "neutral") {
    switch (mood.mood) {
      case "stressed":
      case "rushed":
        guidance.push("🏃 המשתמש נשמע לחוץ/ממהר — תהיי קצרה וענינית, בלי פלאפים.");
        break;
      case "frustrated":
        guidance.push("😤 המשתמש נשמע מתוסכל — תודי לו על הסבלנות ותני תשובה ישירה.");
        break;
      case "happy":
      case "excited":
        guidance.push("😊 המשתמש בכיף — אפשר להיות יותר שובבה ולחגוג איתו.");
        break;
      case "sad":
        guidance.push("💙 המשתמש נשמע עצוב — תהיי חמה ותומכת, תראי שאכפת לך.");
        break;
    }
  }

  // 10. Time-of-day register — help the AI sound natural for the time
  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" })
  );
  if (hour >= 22 || hour < 7) {
    guidance.push("🌙 שעה מאוחרת — תהיי רגועה ולא רשמית.");
  } else if (hour < 9) {
    guidance.push("☀️ בוקר — פתיחת בוקר חמה.");
  }

  return guidance.slice(0, 3); // Max 3 directives to keep prompt concise
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}
