/**
 * Pairing/approval gate — checks if a non-owner contact is approved to chat.
 */
import { approvalStore } from "../stores";
import { config } from "../config";
import { log } from "../logger";
import type { TraceContext } from "../observability";
import { findContactByPhone } from "../contacts";

interface ApprovalContext {
  chatId: string;
  phone: string;
  contactName: string;
  body: string;
  reply: (text: string) => Promise<void>;
  sendToChat: (targetChatId: string, text: string) => Promise<void>;
  trace?: TraceContext;
}

/**
 * Check if a non-owner, non-group contact is approved to chat.
 * Returns true if the contact is blocked (not approved) and a reply was sent.
 * Returns false if the contact is approved and can proceed.
 */
export async function checkApprovalGate(ctx: ApprovalContext): Promise<boolean> {
  if (approvalStore.isApproved(ctx.chatId)) {
    log.approvalGateResult("approved", ctx.trace);
    return false;
  }

  // Auto-approve: if this phone number belongs to a known contact (added by owner via add_contact)
  const knownContact = findContactByPhone(ctx.phone);
  if (knownContact) {
    approvalStore.addApproved(ctx.chatId);
    log.approvalGateResult("approved", ctx.trace);
    console.log(`[approval] Auto-approved ${ctx.contactName} (${ctx.phone}) — matched known contact ${knownContact.name}`);
    return false;
  }

  if (!approvalStore.isPending(ctx.chatId)) {
    const code = approvalStore.addPending(ctx.chatId, `+${ctx.phone}`);
    log.approvalNewContact(ctx.contactName, `+${ctx.phone}`, code, ctx.trace);
    if (config.ownerChatId) {
      await ctx.sendToChat(
        config.ownerChatId,
        `🔔 איש קשר חדש מנסה לדבר איתי!\n👤 שם: ${ctx.contactName}\n📱 מספר: +${ctx.phone}\n💬 הודעה: "${ctx.body}"\n\n✅ לאשר: *אשר ${code}*\n🚫 לדחות: *דחה ${code}*`
      );
    }
    log.approvalGateResult("pending", ctx.trace);
  } else {
    log.approvalGateResult("blocked", ctx.trace);
  }

  await ctx.reply(
    `היי ${ctx.contactName}! 👋 אני ${config.botName}, עוזרת אישית חכמה.\nאני צריכה אישור מהבעלים שלי לפני שנוכל לדבר. כבר שלחתי לו בקשה – אני אודיע לך ברגע שתאושר! ✨`
  );
  return true;
}
