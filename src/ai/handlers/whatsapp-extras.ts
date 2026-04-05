import { findContactByName, findContactByPhone } from "../../contacts";
import { config as appConfig } from "../../config";
import { findGroupChatId } from "../../muted-groups";
import {
  getSocket,
  isSocketConnected,
  sendTextMessage,
  getGroupMetadata,
  isRegisteredUser,
  getNumberId,
  getProfilePicUrl,
  toBaileysJid,
  toLegacyJid,
} from "../../whatsapp/baileys-client";
import type { ToolHandler } from "./types";

export const whatsappExtrasHandlers: Record<string, ToolHandler> = {
  list_group_members: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const metadata = await getGroupMetadata(groupChatId);
    if (!metadata) return `❌ לא הצלחתי לקבל מידע על הקבוצה.`;
    const ownerPhone = appConfig.ownerPhone?.replace(/\D/g, "") || "";
    const members = metadata.participants.map((p: any) => {
      const phone = p.id.replace(/@.*$/, "");
      const knownContact = findContactByPhone(phone);
      const name = knownContact ? knownContact.name : (p.notify || phone);
      if (phone === ownerPhone) return { name: `${name} (הבעלים)`, phone };
      return { name, phone };
    });
    const lines = members.map((m: any) => `👤 ${m.name} (${m.phone})`);
    return `📋 חברי הקבוצה "${input.group_name}" (${members.length}):\n${lines.join("\n")}`;
  },

  search_messages: async (_input) => {
    return "❌ חיפוש הודעות לא נתמך כרגע (מגבלת Baileys). אפשר לחפש בהיסטוריית השיחה.";
  },

  edit_message: async (_input) => {
    return "❌ עריכת הודעות לא נתמכת כרגע (מגבלת Baileys).";
  },

  delete_message: async (_input) => {
    return "❌ מחיקת הודעות לא נתמכת כרגע (מגבלת Baileys).";
  },

  check_read_status: async (_input) => {
    return "❌ בדיקת סטטוס קריאה לא נתמכת כרגע (מגבלת Baileys).";
  },

  get_contact_info: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const knownContact = findContactByName(input.phone_or_name);
    const phone = knownContact
      ? knownContact.phone.replace(/\D/g, "")
      : input.phone_or_name.replace(/\D/g, "");
    const jid = `${phone}@s.whatsapp.net`;

    try {
      const profilePic = await getProfilePicUrl(jid);
      const lines = [`👤 ${knownContact?.name || phone}`, `📱 ${phone}`];
      if (profilePic) lines.push(`🖼️ תמונת פרופיל: ${profilePic}`);
      return lines.join("\n");
    } catch {
      return `❌ לא מצאתי איש קשר "${input.phone_or_name}" בוואטסאפ.`;
    }
  },

  list_labels: async () => {
    return "❌ תוויות לא נתמכות ב-Baileys.";
  },

  add_label: async (_input) => {
    return "❌ תוויות לא נתמכות ב-Baileys.";
  },

  pin_message: async (_input) => {
    return "❌ הצמדת הודעות לא נתמכת כרגע (מגבלת Baileys).";
  },

  create_poll: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const sock = getSocket();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";

    const contact = findContactByName(input.chat_name);
    let chatId = contact?.chatId;
    if (!chatId) chatId = findGroupChatId(input.chat_name);
    if (!chatId) return `❌ לא מצאתי צ'אט בשם "${input.chat_name}".`;

    await sock.sendMessage(toBaileysJid(chatId), {
      poll: {
        name: input.question,
        values: input.options,
        selectableCount: input.allow_multiple ? 0 : 1,
      },
    });
    return `✅ הסקר "${input.question}" נשלח עם ${input.options.length} אפשרויות!`;
  },

  forward_message: async (_input) => {
    return "❌ העברת הודעות לא נתמכת כרגע (מגבלת Baileys).";
  },

  group_add_member: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const sock = getSocket();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const phone = input.phone.replace(/\D/g, "");
    const participantJid = `${phone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(toBaileysJid(groupChatId), [participantJid], "add");
    return `✅ ${phone} נוסף לקבוצה "${input.group_name}"!`;
  },

  group_remove_member: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const sock = getSocket();
    if (!sock) return "❌ לקוח וואטסאפ לא מחובר.";
    const groupChatId = findGroupChatId(input.group_name);
    if (!groupChatId) return `❌ לא מצאתי קבוצה בשם "${input.group_name}".`;
    const phone = input.phone.replace(/\D/g, "");
    const participantJid = `${phone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(toBaileysJid(groupChatId), [participantJid], "remove");
    return `✅ ${phone} הוסר מהקבוצה "${input.group_name}"!`;
  },

  check_whatsapp_number: async (input) => {
    if (!isSocketConnected()) return "❌ לקוח וואטסאפ לא מחובר.";
    const phone = input.phone.replace(/\D/g, "");
    const registered = await isRegisteredUser(phone);
    if (registered) {
      const numberId = await getNumberId(phone);
      const formatted = numberId ? numberId.replace("@c.us", "") : phone;
      return `✅ המספר ${formatted} רשום בוואטסאפ!`;
    }
    return `❌ המספר ${phone} לא רשום בוואטסאפ.`;
  },
};
