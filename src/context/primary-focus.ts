/**
 * Primary Focus Resolver — determines what Limor should focus on this turn.
 * Deterministic priority-ordered rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus } from "./context-types";

/**
 * Resolve the primary focus for this turn based on intent, open loops, and urgency.
 * Rules are evaluated in strict priority order — first match wins.
 */
export function resolvePrimaryFocus(bundle: ContextBundle): PrimaryFocus {
  const { turnIntent, openLoops, urgency } = bundle;

  // 1. Status query — user explicitly asking for overview
  if (turnIntent.category === "status_query") {
    return {
      type: "status",
      summary: "לתת סטטוס מרוכז",
      reason: "המשתמש ביקש סטטוס או עדכון כללי",
      confidence: 0.95,
    };
  }

  // 2. Correction — user is fixing something
  if (turnIntent.category === "correction") {
    return {
      type: "message",
      summary: "לטפל בתיקון של המשתמש",
      reason: "המשתמש מתקן מידע קודם — לעדכן ולא ליצור חדש",
      confidence: 0.9,
    };
  }

  // 3. Action or reminder request — new task
  if (turnIntent.category === "action_request" || turnIntent.category === "reminder_request") {
    return {
      type: "new_request",
      summary: "לטפל בבקשה החדשה",
      reason: `המשתמש ביקש ${turnIntent.category === "reminder_request" ? "תזכורת" : "לבצע פעולה"}`,
      confidence: 0.9,
    };
  }

  // 4. Overdue followup — urgent open item
  const overdueFollowup = openLoops.followups.find((f) => f.isOverdue);
  if (overdueFollowup) {
    const desc = overdueFollowup.reason.substring(0, 60);
    return {
      type: "followup",
      summary: "לטפל ב-followup הפתוח",
      reason: `יש משימה שעבר הזמן שלה: "${desc}"`,
      confidence: 0.95,
    };
  }

  // 5. Pending meeting for this chat
  if (openLoops.pendingMeeting) {
    return {
      type: "meeting",
      summary: "לטפל בבקשת הפגישה",
      reason: `פגישה ממתינה מ-${openLoops.pendingMeeting.requesterName}: ${openLoops.pendingMeeting.topic}`,
      confidence: 0.9,
    };
  }

  // 6. Minimal message + has followups — user probably asking about pending items
  if (turnIntent.isMinimal && openLoops.followups.length > 0) {
    const desc = openLoops.followups[0].reason.substring(0, 60);
    return {
      type: "followup",
      summary: "לעדכן על דברים פתוחים",
      reason: `הודעה קצרה עם followup פתוח: "${desc}"`,
      confidence: 0.8,
    };
  }

  // 7. Default — respond to the message
  return {
    type: "message",
    summary: "לענות על ההודעה",
    reason: "שיחה רגילה ללא דחיפות מיוחדת",
    confidence: 0.7,
  };
}
