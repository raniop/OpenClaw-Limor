import { findContactByName, findContactByPhone, getRecentContacts, addManualContact, listAllContacts, removeContact } from "../../contacts";
import { approvalStore } from "../../stores";
import { config } from "../../config";
import { getHistory } from "../../conversation";
import { findGroupChatId, registerGroup, listAllRegisteredGroups, getGroupNameById } from "../../muted-groups";
import { getSendMessageCallback } from "../callbacks";
import { logAudit } from "../../audit/audit-log";
import { grantContactTools, revokeContactTools, getContactGrants } from "../../permissions/permission-service";
import type { ToolHandler } from "./types";

/**
 * Fetch the live list of groups the bot participates in from Baileys.
 * Also registers any discovered groups so future name lookups work.
 * Returns an empty array if socket is unavailable.
 */
async function fetchLiveGroups(): Promise<Array<{ chatId: string; name: string }>> {
  try {
    // Lazy require avoids circular dep between ai/handlers and whatsapp/index
    const { getSock } = require("../../whatsapp/index");
    const sock = getSock?.();
    if (!sock || typeof sock.groupFetchAllParticipating !== "function") return [];
    const groupsMap = await sock.groupFetchAllParticipating();
    const result: Array<{ chatId: string; name: string }> = [];
    for (const [chatId, meta] of Object.entries(groupsMap || {})) {
      const name = (meta as any)?.subject || chatId;
      result.push({ chatId, name });
      // Backfill the registry so fuzzy search in findGroupChatId works next time
      try { registerGroup(name, chatId); } catch {}
    }
    return result;
  } catch (err) {
    console.warn("[contacts] fetchLiveGroups failed:", (err as Error)?.message);
    return [];
  }
}

/**
 * Merge live + registry groups, dedup by chatId. Live names win (more up-to-date).
 */
async function listAllGroupsMerged(): Promise<Array<{ chatId: string; name: string }>> {
  const live = await fetchLiveGroups();
  const liveIds = new Set(live.map((g) => g.chatId));
  const registry = listAllRegisteredGroups().filter((g) => !liveIds.has(g.chatId));
  return [...live, ...registry];
}

/**
 * Resolve a group name → chatId with live fallback.
 * Tries the registry first (fast), then fetches live groups if not found.
 */
async function resolveGroupChatId(name: string): Promise<string | undefined> {
  const quick = findGroupChatId(name);
  if (quick) return quick;
  // Backfill from live, then retry (fuzzy matcher in findGroupChatId is now aware of new names)
  await fetchLiveGroups();
  return findGroupChatId(name);
}

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

  list_my_groups: async (input) => {
    const groups = await listAllGroupsMerged();
    if (groups.length === 0) {
      return "❌ לא מצאתי קבוצות פעילות. ייתכן שהבוט עוד לא התחבר או שאין לו גישה לרשימת הקבוצות.";
    }
    const includeEmpty = input?.include_empty !== false;
    const lines: string[] = [`📋 *קבוצות שאני חברה בהן* (${groups.length}):`];
    const withActivity: Array<{ name: string; chatId: string; msgCount: number }> = [];
    const withoutActivity: Array<{ name: string; chatId: string }> = [];
    for (const g of groups) {
      const h = getHistory(g.chatId);
      if (h.length > 0) withActivity.push({ ...g, msgCount: h.length });
      else withoutActivity.push(g);
    }
    withActivity.sort((a, b) => b.msgCount - a.msgCount);
    if (withActivity.length > 0) {
      lines.push("\n🟢 *עם פעילות אחרונה:*");
      for (const g of withActivity) lines.push(`• ${g.name} — ${g.msgCount} הודעות`);
    }
    if (includeEmpty && withoutActivity.length > 0) {
      lines.push("\n⚪ *ללא הודעות שמורות:*");
      for (const g of withoutActivity) lines.push(`• ${g.name}`);
    }
    lines.push("\n⬅️ עכשיו אפשר לקרוא ל-summarize_group_activity עם שם מדויק מהרשימה.");
    return lines.join("\n");
  },

  get_group_history: async (input) => {
    const groupChatId = await resolveGroupChatId(input.group_name);
    if (!groupChatId) {
      const available = await listAllGroupsMerged();
      const names = available.slice(0, 15).map((g) => `• ${g.name}`).join("\n");
      return `❌ לא מצאתי קבוצה בשם "${input.group_name}".\nקבוצות זמינות:\n${names}\n\nנסי שוב עם שם מדויק או חלק ממנו.`;
    }
    const history = getHistory(groupChatId);
    const groupLabel = getGroupNameById(groupChatId) || input.group_name;
    if (history.length === 0) return `אין היסטוריית שיחה שמורה בקבוצה "${groupLabel}" (ייתכן שהבוט לא ראה הודעות בה עדיין).`;
    const lastN = input.last_n || 20;
    const recent = history.slice(-lastN);
    return recent.map((m: any) => m.content).join("\n");
  },

  grant_tool_access: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const contact = findContactByName(input.contact_name);
    if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;

    const patterns: string[] = input.tool_patterns;
    if (!patterns || patterns.length === 0) return "❌ צריך לציין לפחות כלי אחד";

    // Resolve chatId — if manual, use phone-based chatId
    let chatId = contact.chatId;
    if (chatId.startsWith("manual_")) {
      const phone = contact.phone?.replace(/\D/g, "");
      if (phone) chatId = `${phone}@c.us`;
      else return `❌ אין ל-${contact.name} מזהה WhatsApp. הוא צריך לשלוח הודעה ל${config.botName} קודם.`;
    }

    grantContactTools(chatId, patterns);
    logAudit(actor, "tool_access_granted", `${contact.name}: ${patterns.join(", ")}`, "success");
    return `✅ נתתי ל-${contact.name} גישה ל: ${patterns.join(", ")}`;
  },

  revoke_tool_access: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const contact = findContactByName(input.contact_name);
    if (!contact) return `❌ לא מצאתי איש קשר בשם "${input.contact_name}"`;

    let chatId = contact.chatId;
    if (chatId.startsWith("manual_")) {
      const phone = contact.phone?.replace(/\D/g, "");
      if (phone) chatId = `${phone}@c.us`;
      else return `❌ אין ל-${contact.name} מזהה WhatsApp.`;
    }

    const patterns: string[] | undefined = input.tool_patterns;
    const currentGrants = getContactGrants(chatId);
    if (currentGrants.length === 0) return `${contact.name} לא מחזיק בהרשאות מיוחדות.`;

    revokeContactTools(chatId, patterns);
    const label = patterns && patterns.length > 0 ? patterns.join(", ") : "כל ההרשאות";
    logAudit(actor, "tool_access_revoked", `${contact.name}: ${label}`, "success");
    return `✅ הסרתי מ-${contact.name} גישה ל: ${label}`;
  },

  summarize_group_activity: async (input) => {
    const groupChatId = await resolveGroupChatId(input.group_name);
    if (!groupChatId) {
      const available = await listAllGroupsMerged();
      const names = available.slice(0, 15).map((g) => `• ${g.name}`).join("\n");
      return `❌ לא מצאתי קבוצה בשם "${input.group_name}".\nקבוצות זמינות:\n${names}\n\nנסי שוב עם שם מדויק או חלק ממנו.`;
    }
    const groupLabel = getGroupNameById(groupChatId) || input.group_name;
    const history = getHistory(groupChatId);
    if (history.length === 0) return `אין היסטוריית שיחה שמורה בקבוצה "${groupLabel}" (ייתכן שהבוט לא ראה הודעות בה עדיין).`;
    const sinceHours = input.since_hours || 24;
    const lastN = Math.min(history.length, sinceHours * 2);
    const recent = history.slice(-lastN);
    const messages = recent.map((m: any) => m.content).join("\n");
    return `📋 סיכום קבוצה "${groupLabel}" (${sinceHours} שעות אחרונות):\n\n${messages}\n\n---\nסה"כ ${recent.length} הודעות. סכם את ההודעות למעלה: מה קרה, מי הזכיר את ${config.ownerName}, מה דורש פעולה.`;
  },
};
