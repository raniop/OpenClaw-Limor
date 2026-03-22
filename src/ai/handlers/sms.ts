import { isAvailable, getRecentMessages, searchMessages, findDeliveryAlerts, addDelivery, getDeliveries, markReceivedByMatch } from "../../sms";
import type { ToolHandler } from "./types";

export const smsHandlers: Record<string, ToolHandler> = {
  read_sms: async (input) => {
    if (!isAvailable()) return "❌ אין גישה ל-Messages DB. צריך Full Disk Access.";
    const messages = getRecentMessages(input.limit || 15, input.hours || 24, input.sms_only || false);
    if (messages.length === 0) return "אין הודעות חדשות בטווח הזמן המבוקש.";
    return messages.map((m: any) =>
      `${m.isFromMe ? "←" : "→"} ${m.sender} (${m.timestamp}): ${m.text.substring(0, 200)}`
    ).join("\n");
  },

  search_sms: async (input) => {
    if (!isAvailable()) return "❌ אין גישה ל-Messages DB.";
    const messages = searchMessages(input.keyword, input.limit || 10);
    if (messages.length === 0) return `לא נמצאו הודעות עם "${input.keyword}"`;
    return messages.map((m: any) =>
      `${m.isFromMe ? "←" : "→"} ${m.sender} (${m.timestamp}): ${m.text.substring(0, 200)}`
    ).join("\n");
  },

  check_deliveries: async (input) => {
    if (!isAvailable()) return "❌ אין גישה ל-Messages DB.";
    const messages = getRecentMessages(300, input.hours || 168, false);
    const alerts = findDeliveryAlerts(messages);
    for (const a of alerts) {
      addDelivery(a.message.id, a.carrier, a.summary, a.message.text, a.message.sender, a.message.timestamp, a.trackingNumber);
    }
    const pending = getDeliveries("pending");
    if (alerts.length === 0 && pending.length === 0) return "אין הודעות על חבילות או משלוחים.";
    const parts: string[] = [];
    if (pending.length > 0) {
      parts.push(`📦 ${pending.length} משלוחים ממתינים:`);
      for (const d of pending) {
        const track = d.trackingNumber ? ` | מספר מעקב: ${d.trackingNumber}` : "";
        parts.push(`  - ${d.carrier}: ${d.summary}${track} (${d.smsTimestamp})`);
      }
    }
    if (alerts.length > 0 && pending.length === 0) {
      for (const a of alerts) {
        parts.push(`📦 ${a.summary}\n   ${a.message.sender} (${a.message.timestamp}): ${a.message.text.substring(0, 150)}`);
      }
    }
    return parts.join("\n");
  },

  mark_delivery_received: async (input) => {
    const entry = markReceivedByMatch(input.keyword);
    if (entry) return `✅ סומן כנמסר: ${entry.summary}`;
    const pending = getDeliveries("pending");
    if (pending.length === 0) return "אין משלוחים ממתינים לסימון.";
    return `לא מצאתי משלוח מתאים ל-"${input.keyword}". משלוחים ממתינים:\n${pending.map((d: any) => `  - ${d.summary}`).join("\n")}`;
  },

  list_pending_deliveries: async () => {
    const pending = getDeliveries("pending");
    if (pending.length === 0) return "אין משלוחים ממתינים! 🎉";
    return pending.map((d: any) => `📦 ${d.summary} (${d.smsTimestamp})`).join("\n");
  },
};
