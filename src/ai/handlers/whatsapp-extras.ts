import { findContactByName, findContactByPhone } from "../../contacts";
import { config as appConfig } from "../../config";
import { getClient } from "../../whatsapp";
import { findGroupChatId } from "../../muted-groups";
import { Poll } from "whatsapp-web.js";
import type { ToolHandler } from "./types";

export const whatsappExtrasHandlers: Record<string, ToolHandler> = {
  list_group_members: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const chat = await waClient.getChatById(groupChatId) as any;
    if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
    const participants = chat.participants || [];
    const botNumber = waClient.info?.wid?.user || "";
    const ownerPhone = appConfig.ownerPhone?.replace(/\D/g, "") || "";
    const members = await Promise.all(
      participants.map(async (p: any) => {
        const pNumber = p.id.user || "";
        try {
          const contact = await waClient.getContactById(p.id._serialized);
          const rawName = contact.pushname || contact.name || "לא ידוע";
          const phone = contact.number || pNumber;
          if (pNumber === botNumber) {
            return { name: "לימור (אני 🤖)", phone };
          }
          if (phone.replace(/\D/g, "") === ownerPhone || pNumber === ownerPhone) {
            return { name: `${rawName} (הבעלים)`, phone };
          }
          const knownContact = findContactByPhone(phone);
          const finalName = knownContact ? knownContact.name : rawName;
          return { name: finalName, phone };
        } catch {
          if (pNumber === botNumber) return { name: "לימור (אני 🤖)", phone: pNumber };
          return { name: "לא ידוע", phone: pNumber };
        }
      })
    );
    const lines = members.map((m: any) => `👤 ${m.name} (${m.phone})`);
    return `📋 חברי הקבוצה "${input.group_name}" (${members.length}):\n${lines.join("\n")}`;
  },

  search_messages: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const options: any = { limit: 20 };
    if (input.contact_name) {
      const contact = findContactByName(input.contact_name);
      if (contact) {
        options.chatId = contact.chatId;
      } else {
        const groupId = findGroupChatId(input.contact_name);
        if (groupId) options.chatId = groupId;
      }
    }
    const results = await waClient.searchMessages(input.query, options);
    if (results.length === 0) return `לא נמצאו הודעות עבור "${input.query}".`;
    const lines = await Promise.all(
      results.slice(0, 20).map(async (m: any) => {
        const contact = await m.getContact();
        const name_ = contact.pushname || contact.name || contact.number || "לא ידוע";
        const time = new Date(m.timestamp * 1000).toLocaleString("he-IL");
        return `[${time}] ${name_}: ${m.body}`;
      })
    );
    return `🔍 תוצאות חיפוש "${input.query}" (${results.length}):\n${lines.join("\n")}`;
  },

  edit_message: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const chat = await waClient.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 30 });
    const myMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.old_text));
    if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.old_text}" ב-30 ההודעות האחרונות.`;
    await myMsg.edit(input.new_text);
    return `✅ ההודעה עודכנה בהצלחה!`;
  },

  delete_message: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const chat = await waClient.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 30 });
    const myMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.message_text));
    if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.message_text}" ב-30 ההודעות האחרונות.`;
    await myMsg.delete(true);
    return `✅ ההודעה נמחקה בהצלחה!`;
  },

  check_read_status: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const chat = await waClient.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 20 });
    let targetMsg: any;
    if (input.message_text) {
      targetMsg = messages.reverse().find((m: any) => m.fromMe && m.body.includes(input.message_text));
    } else {
      targetMsg = messages.reverse().find((m: any) => m.fromMe);
    }
    if (!targetMsg) return "❌ לא מצאתי הודעה שלי לבדיקה.";
    const info = await targetMsg.getInfo();
    if (!info) return "❌ לא הצלחתי לקבל מידע על ההודעה.";
    const readBy = info.read?.length || 0;
    const deliveredTo = info.delivery?.length || 0;
    if (readBy > 0) return `✅ ההודעה נקראה (${readBy} קוראים).`;
    if (deliveredTo > 0) return `📨 ההודעה נמסרה (${deliveredTo}) אבל עדיין לא נקראה.`;
    return `📤 ההודעה נשלחה אבל עדיין לא נמסרה.`;
  },

  get_contact_info: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    let contactId: string;
    const knownContact = findContactByName(input.phone_or_name);
    if (knownContact) {
      const phone = knownContact.phone.replace(/\D/g, "");
      contactId = `${phone}@c.us`;
    } else {
      const phone = input.phone_or_name.replace(/\D/g, "");
      contactId = `${phone}@c.us`;
    }
    try {
      const waContact = await waClient.getContactById(contactId);
      const profilePic = await waContact.getProfilePicUrl().catch(() => null);
      const about = await waContact.getAbout().catch(() => null);
      const name_ = waContact.pushname || waContact.name || "לא ידוע";
      const lines = [`👤 ${name_}`, `📱 ${waContact.number}`];
      if (about) lines.push(`📝 ביו: ${about}`);
      if (profilePic) lines.push(`🖼️ תמונת פרופיל: ${profilePic}`);
      return lines.join("\n");
    } catch {
      return `❌ לא מצאתי איש קשר "${input.phone_or_name}" בוואטסאפ.`;
    }
  },

  list_labels: async () => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const labels = await waClient.getLabels();
    if (labels.length === 0) return "אין תוויות מוגדרות.";
    const lines = labels.map((l: any) => `🏷️ ${l.name} (ID: ${l.id})`);
    return `📋 תוויות (${labels.length}):\n${lines.join("\n")}`;
  },

  add_label: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const labels = await waClient.getLabels();
    const label = labels.find((l: any) => l.name.includes(input.label_name) || input.label_name.includes(l.name));
    if (!label) return `❌ לא מצאתי תווית בשם "${input.label_name}". השתמשי ב-list_labels כדי לראות תוויות זמינות.`;
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    await waClient.addOrRemoveLabels([label.id], [chatId]);
    return `✅ התווית "${label.name}" נוספה לצ'אט "${input.chat_name}".`;
  },

  pin_message: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const chat = await waClient.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 30 });
    const targetMsg = messages.reverse().find((m: any) => m.body.includes(input.message_text));
    if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}".`;
    const durationSec = (input.duration_days || 7) * 86400;
    await targetMsg.pin(durationSec);
    return `📌 ההודעה הוצמדה בהצלחה ל-${input.duration_days || 7} ימים!`;
  },

  create_poll: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const poll = new Poll(input.question, input.options, {
      allowMultipleAnswers: input.allow_multiple || false,
    } as any);
    await waClient.sendMessage(chatId, poll);
    return `✅ הסקר "${input.question}" נשלח עם ${input.options.length} אפשרויות!`;
  },

  forward_message: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const sourceContact = findContactByName(input.source_chat);
    let sourceChatId = sourceContact?.chatId;
    if (!sourceChatId) sourceChatId = findGroupChatId(input.source_chat);
    if (!sourceChatId) return `❌ לא מצאתי צ'אט מקור בשם "${input.source_chat}".`;
    const targetContact = findContactByName(input.target_chat);
    let targetChatId = targetContact?.chatId;
    if (!targetChatId) targetChatId = findGroupChatId(input.target_chat);
    if (!targetChatId) return `❌ לא מצאתי צ'אט יעד בשם "${input.target_chat}".`;
    const chat = await waClient.getChatById(sourceChatId);
    const messages = await chat.fetchMessages({ limit: 30 });
    const targetMsg = messages.reverse().find((m: any) => m.body.includes(input.message_text));
    if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}" בצ'אט "${input.source_chat}".`;
    await targetMsg.forward(targetChatId);
    return `✅ ההודעה הועברה בהצלחה מ-"${input.source_chat}" ל-"${input.target_chat}"!`;
  },

  group_add_member: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const chat = await waClient.getChatById(groupChatId) as any;
    if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
    const phone = input.phone.replace(/\D/g, "");
    const participantId = `${phone}@c.us`;
    await chat.addParticipants([participantId]);
    return `✅ ${phone} נוסף לקבוצה "${input.group_name}"!`;
  },

  group_remove_member: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const chat = await waClient.getChatById(groupChatId) as any;
    if (!chat.isGroup) return `❌ "${input.group_name}" הוא לא קבוצה.`;
    const phone = input.phone.replace(/\D/g, "");
    const participantId = `${phone}@c.us`;
    await chat.removeParticipants([participantId]);
    return `✅ ${phone} הוסר מהקבוצה "${input.group_name}"!`;
  },

  check_whatsapp_number: async (input) => {
    const waClient = getClient();
    if (!waClient) return "❌ לקוח וואטסאפ לא מחובר.";
    const phone = input.phone.replace(/\D/g, "");
    const contactId = `${phone}@c.us`;
    const isRegistered = await waClient.isRegisteredUser(contactId);
    if (isRegistered) {
      const numberId = await waClient.getNumberId(phone);
      const formatted = numberId ? numberId._serialized.replace("@c.us", "") : phone;
      return `✅ המספר ${formatted} רשום בוואטסאפ!`;
    }
    return `❌ המספר ${phone} לא רשום בוואטסאפ.`;
  },
};
