import { findContactByName, findContactByPhone } from "../../contacts";
import { config as appConfig } from "../../config";
import { getSock } from "../../whatsapp";
import { findGroupChatId } from "../../muted-groups";
import { getRecentMessages } from "../../whatsapp/baileys-store";
import { adaptMessage, extractText } from "../../whatsapp/baileys-adapter";
import type { ToolHandler } from "./types";

export const whatsappExtrasHandlers: Record<string, ToolHandler> = {
  list_group_members: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    try {
      const meta = await sock.groupMetadata(groupChatId);
      const botNumber = sock.user?.id?.replace(/@.*/, "").replace(/:\d+/, "") || "";
      const ownerPhone = appConfig.ownerPhone?.replace(/\D/g, "") || "";
      const members = meta.participants.map((p: any) => {
        const pNumber = p.id.replace(/@.*/, "");
        const knownContact = findContactByPhone(pNumber);
        let name = knownContact?.name || pNumber;
        if (pNumber === botNumber) name = `${appConfig.botName} (אני 🤖)`;
        else if (pNumber === ownerPhone) name = `${name} (הבעלים)`;
        return { name, phone: pNumber };
      });
      const lines = members.map((m: any) => `👤 ${m.name} (${m.phone})`);
      return `📋 חברי הקבוצה "${input.group_name}" (${members.length}):\n${lines.join("\n")}`;
    } catch (err) {
      return `❌ שגיאה בגישה לקבוצה: ${(err as any).message}`;
    }
  },

  search_messages: async (_input) => {
    return "❌ חיפוש הודעות לא נתמך כרגע (Baileys לא תומך בחיפוש שרת). בעתיד נוסיף חיפוש מקומי.";
  },

  edit_message: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const messages = getRecentMessages(chatId, 30);
    const myMsg = [...messages].reverse().find((m: any) => m.key.fromMe && extractText(m).includes(input.old_text));
    if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.old_text}" ב-30 ההודעות האחרונות.`;
    await sock.sendMessage(chatId, { text: input.new_text, edit: myMsg.key });
    return `✅ ההודעה עודכנה בהצלחה!`;
  },

  delete_message: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const messages = getRecentMessages(chatId, 30);
    const myMsg = [...messages].reverse().find((m: any) => m.key.fromMe && extractText(m).includes(input.message_text));
    if (!myMsg) return `❌ לא מצאתי הודעה שלי שמכילה "${input.message_text}" ב-30 ההודעות האחרונות.`;
    await sock.sendMessage(chatId, { delete: myMsg.key });
    return `✅ ההודעה נמחקה בהצלחה!`;
  },

  check_read_status: async (_input) => {
    return "❌ בדיקת סטטוס קריאה לא נתמכת כרגע (Baileys).";
  },

  get_contact_info: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const knownContact = findContactByName(input.phone_or_name);
    const phone = knownContact
      ? knownContact.phone.replace(/\D/g, "")
      : input.phone_or_name.replace(/\D/g, "");
    const jid = `${phone}@s.whatsapp.net`;
    try {
      const name_ = knownContact?.name || phone;
      const lines = [`👤 ${name_}`, `📱 ${phone}`];
      try {
        const profilePic = await sock.profilePictureUrl(jid, "image");
        if (profilePic) lines.push(`🖼️ תמונת פרופיל: ${profilePic}`);
      } catch {}
      return lines.join("\n");
    } catch {
      return `❌ לא מצאתי איש קשר "${input.phone_or_name}" בוואטסאפ.`;
    }
  },

  list_labels: async () => {
    return "❌ תוויות לא נתמכות כרגע (Baileys).";
  },

  add_label: async (_input) => {
    return "❌ תוויות לא נתמכות כרגע (Baileys).";
  },

  pin_message: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    const messages = getRecentMessages(chatId, 30);
    const targetMsg = [...messages].reverse().find((m: any) => extractText(m).includes(input.message_text));
    if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}".`;
    try {
      await sock.sendMessage(chatId, { pin: targetMsg.key } as any);
      return `📌 ההודעה הוצמדה בהצלחה!`;
    } catch (err) {
      return `❌ שגיאה בהצמדה: ${(err as any).message}`;
    }
  },

  create_poll: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;
    await sock.sendMessage(chatId, {
      poll: {
        name: input.question,
        values: input.options,
        selectableCount: input.allow_multiple ? 0 : 1,
      },
    } as any);
    return `✅ הסקר "${input.question}" נשלח עם ${input.options.length} אפשרויות!`;
  },

  forward_message: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const sourceContact = findContactByName(input.source_chat);
    let sourceChatId = sourceContact?.chatId;
    if (!sourceChatId) sourceChatId = findGroupChatId(input.source_chat);
    if (!sourceChatId) return `❌ לא מצאתי צ'אט מקור בשם "${input.source_chat}".`;
    const targetContact = findContactByName(input.target_chat);
    let targetChatId = targetContact?.chatId;
    if (!targetChatId) targetChatId = findGroupChatId(input.target_chat);
    if (!targetChatId) return `❌ לא מצאתי צ'אט יעד בשם "${input.target_chat}".`;
    const messages = getRecentMessages(sourceChatId, 30);
    const targetMsg = [...messages].reverse().find((m: any) => extractText(m).includes(input.message_text));
    if (!targetMsg) return `❌ לא מצאתי הודעה שמכילה "${input.message_text}" בצ'אט "${input.source_chat}".`;
    await sock.sendMessage(targetChatId, { forward: targetMsg } as any);
    return `✅ ההודעה הועברה בהצלחה מ-"${input.source_chat}" ל-"${input.target_chat}"!`;
  },

  group_add_member: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const phone = input.phone.replace(/\D/g, "");
    const participantId = `${phone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(groupChatId, [participantId], "add");
    return `✅ ${phone} נוסף לקבוצה "${input.group_name}"!`;
  },

  group_remove_member: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const phone = input.phone.replace(/\D/g, "");
    const participantId = `${phone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(groupChatId, [participantId], "remove");
    return `✅ ${phone} הוסר מהקבוצה "${input.group_name}"!`;
  },

  check_whatsapp_number: async (input) => {
    const sock = getSock();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const phone = input.phone.replace(/\D/g, "");
    const result = await sock.onWhatsApp(phone);
    if (result && result.length > 0 && result[0].exists) {
      const jid = result[0].jid;
      const formatted = jid.replace("@s.whatsapp.net", "");
      return `✅ המספר ${formatted} רשום בוואטסאפ!`;
    }
    return `❌ המספר ${phone} לא רשום בוואטסאפ.`;
  },
};
