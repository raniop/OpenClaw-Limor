/**
 * Lightweight in-memory message store for Baileys.
 * Keeps recent messages per chat for fetchMessages() support.
 */

type WAMessage = import("@whiskeysockets/baileys").WAMessage;

const MAX_PER_CHAT = 50;
const messageStore = new Map<string, WAMessage[]>();

export function storeMessage(jid: string, msg: WAMessage): void {
  if (!messageStore.has(jid)) {
    messageStore.set(jid, []);
  }
  const msgs = messageStore.get(jid)!;
  msgs.push(msg);
  if (msgs.length > MAX_PER_CHAT) {
    msgs.shift();
  }
}

export function getRecentMessages(jid: string, limit: number): WAMessage[] {
  const msgs = messageStore.get(jid) || [];
  return msgs.slice(-limit);
}

export function clearMessages(jid: string): void {
  messageStore.delete(jid);
}
