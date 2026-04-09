/**
 * Message adapter — converts OpenClaw gateway inbound events to
 * duck-typed objects matching the whatsapp-web.js Message interface.
 *
 * handleMessage() in whatsapp/index.ts accesses these properties:
 *   msg.fromMe, msg.hasMedia, msg.type, msg.from, msg.author
 *   msg.body, msg.hasQuotedMsg, msg.vCards
 *   msg.reply(), msg.react(), msg.getContact(), msg.getChat()
 *   msg.getQuotedMessage(), msg.downloadMedia()
 */
import { gatewaySendText } from "./gateway-client";

/**
 * Canonical inbound message shape from OpenClaw events.
 * Maps to CanonicalInboundMessageHookContext in the SDK.
 */
export interface OpenClawInboundMessage {
  from: string;           // sender JID (e.g., "972501234567@s.whatsapp.net")
  to?: string;            // recipient JID
  content: string;        // message body text
  body?: string;          // raw body
  timestamp?: number;
  channelId: string;      // "whatsapp"
  accountId?: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;      // sender phone/JID
  senderName?: string;    // push name
  senderE164?: string;    // E.164 phone number
  isGroup: boolean;
  groupId?: string;
  threadId?: string | number;
  mediaPath?: string;     // local path to downloaded media
  mediaType?: string;     // MIME type
  mediaPaths?: string[];
  mediaTypes?: string[];
  // Quoted message (if available in event)
  quotedMessageBody?: string;
  quotedMessageFrom?: string;
  quotedMessageFromMe?: boolean;
  // vCards
  vCards?: string[];
}

/**
 * Creates a virtual Message object that matches the duck-typed interface
 * expected by handleMessage() in whatsapp/index.ts.
 */
export function createVirtualMessage(inbound: OpenClawInboundMessage) {
  const hasMedia = !!(inbound.mediaPath || (inbound.mediaPaths && inbound.mediaPaths.length > 0));
  const mediaType = inbound.mediaType || "";
  const isAudio = mediaType.startsWith("audio/") || mediaType === "ptt";

  // Determine message type
  let type = "chat";
  if (isAudio) type = "ptt";
  else if (hasMedia && mediaType.startsWith("image/")) type = "image";
  else if (hasMedia && mediaType.startsWith("video/")) type = "video";
  else if (hasMedia) type = "document";
  if (inbound.vCards && inbound.vCards.length > 0) type = "vcard";

  // Normalize the "from" field to WhatsApp JID format
  const from = normalizeToWhatsAppJid(inbound.from, inbound.isGroup, inbound.groupId);
  const author = inbound.isGroup ? normalizeToWhatsAppJid(inbound.senderId || inbound.from, false) : undefined;

  const msg = {
    fromMe: false,
    from,
    author,
    body: inbound.content || inbound.body || "",
    type,
    hasMedia,
    hasQuotedMsg: !!(inbound.quotedMessageBody),
    vCards: inbound.vCards || [],
    id: { _serialized: inbound.messageId || `oc_${Date.now()}` },
    timestamp: inbound.timestamp || Math.floor(Date.now() / 1000),

    /**
     * Reply to this message — sends response back through OpenClaw gateway.
     */
    async reply(text: string): Promise<void> {
      await gatewaySendText(from, text);
    },

    /**
     * React to this message — best-effort, may not be supported.
     */
    async react(emoji: string): Promise<void> {
      // Reactions via gateway may require "chat.react" method
      // For now, silently skip — reactions are cosmetic, not critical
      try {
        // Will implement when we verify the gateway supports reactions
        console.log(`[openclaw] Reaction ${emoji} (not yet implemented via gateway)`);
      } catch {}
    },

    /**
     * Get contact info for the message sender.
     */
    async getContact() {
      const phone = extractPhone(inbound.senderId || inbound.from);
      return {
        number: phone,
        pushname: inbound.senderName || "",
        name: inbound.senderName || "",
        isMyContact: false,
        id: { _serialized: normalizeToWhatsAppJid(inbound.senderId || inbound.from, false) },
      };
    },

    /**
     * Get chat info.
     */
    async getChat() {
      return {
        id: { _serialized: from },
        name: inbound.senderName || from,
        isGroup: inbound.isGroup,
        async sendSeen() {},
        async sendStateTyping() {},
        async clearState() {},
      };
    },

    /**
     * Get quoted message if available.
     */
    async getQuotedMessage() {
      if (!inbound.quotedMessageBody) {
        throw new Error("No quoted message");
      }
      return {
        body: inbound.quotedMessageBody,
        fromMe: inbound.quotedMessageFromMe || false,
        from: inbound.quotedMessageFrom || from,
        async getContact() {
          return {
            pushname: "",
            name: "",
            number: extractPhone(inbound.quotedMessageFrom || ""),
          };
        },
      };
    },

    /**
     * Download media from OpenClaw's local media path.
     * Returns { data: base64, mimetype } matching whatsapp-web.js MessageMedia.
     */
    async downloadMedia() {
      if (!inbound.mediaPath) {
        throw new Error("No media available");
      }
      const { readFileSync } = await import("fs");
      const data = readFileSync(inbound.mediaPath);
      return {
        data: data.toString("base64"),
        mimetype: inbound.mediaType || "application/octet-stream",
        filename: inbound.mediaPath.split("/").pop() || "file",
      };
    },
  };

  return msg;
}

/**
 * Normalize a sender ID to WhatsApp JID format.
 * OpenClaw may send JIDs, E.164 numbers, or other formats.
 */
function normalizeToWhatsAppJid(id: string, isGroup: boolean, groupId?: string): string {
  if (isGroup && groupId) {
    // Group JIDs end with @g.us
    if (groupId.includes("@g.us")) return groupId;
    return `${groupId}@g.us`;
  }

  // Already a JID
  if (id.includes("@")) return id;

  // E.164 phone number → JID
  const phone = id.replace(/^\+/, "").replace(/\D/g, "");
  if (phone) return `${phone}@s.whatsapp.net`;

  return id;
}

/**
 * Extract phone number from a JID or E.164 string.
 */
function extractPhone(id: string): string {
  return id.replace(/@.*$/, "").replace(/^\+/, "").replace(/\D/g, "");
}
