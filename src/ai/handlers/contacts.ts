import { findContactByName, findContactByPhone, getRecentContacts, addManualContact, listAllContacts, removeContact } from "../../contacts";
import { approvalStore } from "../../stores";
import { config } from "../../config";
import { getHistory } from "../../conversation";
import { findGroupChatId } from "../../muted-groups";
import { getSendMessageCallback } from "../callbacks";
import { logAudit } from "../../audit/audit-log";
import type { ToolHandler } from "./types";

export const contactsHandlers: Record<string, ToolHandler> = {
  send_message: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const contact = findContactByName(input.contact_name);
    if (!contact) {
      const recent = getRecentContacts(5);
      const names = recent.map((c) => c.name).join(", ");
      return `❌ נכשל: לא מצאתי איש קשר בשם "${input.contact_name}". ההודעה לא נשלחה! אנשי קשר זמינים: ${names || "אין"}. נסי שוב עם אחד מהשמות האלה.`;
    }
    if (getSendMessageCallback()) {
      let targetChatId = contact.chatId;
      if (targetChatId.startsWith("manual_") || targetChatId.endsWith("@g.us")) {
        const phone = contact.phone.replace(/\D/g, "");
        if (phone) {
          targetChatId = `${phone}@c.us`;
        } else {
          return `❌ נכשל: אין ל-${contact.name} chatId אישי. הוא צריך לשלוח הודעה ל${config.botName} קודם.`;
        }
      }
      await getSendMessageCallback()!(targetChatId, input.message);
      logAudit(actor, "message_sent", contact.name, "success");
      return `✅ ההודעה נשלחה ל-${contact.name} בהצלחה!`;
    }
    return "❌ נכשל: לא הצלחתי לשלוח את ההודעה.";
  },

  add_contact: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const result = addManualContact(input.name, input.phone);
    const phone = input.phone.replace(/\D/g, "");
    if (phone) {
      const manualChatId = `manual_${phone}`;
      approvalStore.addApproved(manualChatId);
    }
    logAudit(actor, "contact_added_and_approved", input.name, "success");
    return result;
  },

  list_contacts: async () => {
    return listAllContacts();
  },

  delete_contact: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const result = removeContact(input.contact_name);
    logAudit(actor, "contact_deleted", input.contact_name, result.startsWith("✅") ? "success" : "failed");
    return result;
  },

  block_contact: async (input) => {
    const contact = findContactByName(input.contact_name);
    if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;
    if (contact.chatId.startsWith("manual_") || contact.chatId.endsWith("@g.us")) {
      return `❌ ${contact.name} לא מאושר כרגע (הוא מקבוצה או manual). אין מה לחסום.`;
    }
    const removed = approvalStore.removeApproved(contact.chatId);
    if (removed) {
      return `✅ חסמתי את ${contact.name}. הוא לא יוכל לדבר איתי עד שתאשר אותו מחדש.`;
    }
    return `${contact.name} לא היה מאושר.`;
  },

  get_contact_history: async (input) => {
    const contact = findContactByName(input.contact_name);
    if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;
    const history = getHistory(contact.chatId);
    if (history.length === 0) return `אין היסטוריית שיחה עם ${contact.name}.`;
    const lastN = input.last_n || 10;
    const recent = history.slice(-lastN);
    return recent.map((m: any) => `${m.role === "user" ? contact.name : config.botName}: ${m.content}`).join("\n");
  },

  get_group_history: async (input) => {
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}". אני צריכה לראות הודעה בקבוצה קודם כדי לזהות אותה.`;
    const history = getHistory(groupChatId);
    if (history.length === 0) return `אין היסטוריית שיחה בקבוצה "${input.group_name}".`;
    const lastN = input.last_n || 20;
    const recent = history.slice(-lastN);
    return recent.map((m: any) => m.content).join("\n");
  },

  summarize_group_activity: async (input) => {
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const history = getHistory(groupChatId);
    if (history.length === 0) return `אין היסטוריית שיחה בקבוצה "${input.group_name}".`;
    const sinceHours = input.since_hours || 24;
    const lastN = Math.min(history.length, sinceHours * 2);
    const recent = history.slice(-lastN);
    const messages = recent.map((m: any) => m.content).join("\n");
    return `📋 סיכום קבוצה "${input.group_name}" (${sinceHours} שעות אחרונות):\n\n${messages}\n\n---\nסה"כ ${recent.length} הודעות. סכם את ההודעות למעלה: מה קרה, מי הזכיר את ${config.ownerName}, מה דורש פעולה.`;
  },
};
