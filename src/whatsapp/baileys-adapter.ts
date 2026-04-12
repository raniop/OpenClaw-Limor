/**
 * Adapter layer: wraps Baileys WAMessage objects to match the duck-typed interfaces
 * that the rest of the codebase expects (originally from whatsapp-web.js).
 * This allows handleMessage(), media-handler, response-handler, etc. to work unchanged.
 */

// Baileys types — imported dynamically at runtime (ESM module)
type BaileysModule = typeof import("@whiskeysockets/baileys");
type WASocket = ReturnType<Awaited<BaileysModule>["makeWASocket"]>;
type WAMessage = import("@whiskeysockets/baileys").WAMessage;
type WAMessageContent = import("@whiskeysockets/baileys").WAMessageContent;

let baileys: BaileysModule;

export async function loadBaileys(): Promise<BaileysModule> {
  if (!baileys) {
    baileys = await import("@whiskeysockets/baileys");
  }
  return baileys;
}

// ─── Adapter interfaces ───────────────────────────────────────────────

export interface AdaptedMessage {
  from: string;
  body: string;
  type: string;
  hasMedia: boolean;
  hasQuotedMsg: boolean;
  fromMe: boolean;
  author: string | undefined;
  timestamp: number;
  id: { _serialized: string };
  mentionedIds: string[];
  vCards: string[];
  isStatus: boolean;
  /** Raw Baileys message — used internally by adapter methods */
  _raw: WAMessage;

  reply(text: string): Promise<void>;
  react(emoji: string): Promise<void>;
  downloadMedia(): Promise<{ data: string; mimetype: string; filename?: string } | null>;
  getQuotedMessage(): Promise<AdaptedMessage | null>;
  getContact(): Promise<AdaptedContact>;
  getChat(): Promise<AdaptedChat>;
}

export interface AdaptedContact {
  number: string;
  pushname: string;
  name: string;
  _serialized: string;
  getProfilePicUrl?(): Promise<string | undefined>;
}

export interface AdaptedChat {
  isGroup: boolean;
  name: string;
  id: { _serialized: string };
  unreadCount: number;
  sendSeen(): Promise<void>;
  sendStateTyping(): Promise<void>;
  fetchMessages(opts: { limit: number }): Promise<AdaptedMessage[]>;
  participants?: Array<{ id: { user: string; _serialized: string } }>;
}

export interface AdaptedMedia {
  mimetype: string;
  data: string; // base64
  filename?: string;
}

// ─── Text extraction ──────────────────────────────────────────────────

export function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  );
}

// ─── Message type mapping ─────────────────────────────────────────────

export function getMessageType(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "chat";
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return m.audioMessage.ptt ? "ptt" : "audio";
  if (m.documentMessage) return "document";
  if (m.documentWithCaptionMessage) return "document";
  if (m.stickerMessage) return "sticker";
  if (m.contactMessage || m.contactsArrayMessage) return "vcard";
  if (m.locationMessage || m.liveLocationMessage) return "location";
  if (m.pollCreationMessage || m.pollCreationMessageV3) return "poll";
  return "chat";
}

// ─── Has media check ──────────────────────────────────────────────────

function hasMediaContent(msg: WAMessage): boolean {
  const m = msg.message;
  if (!m) return false;
  return !!(
    m.imageMessage ||
    m.videoMessage ||
    m.audioMessage ||
    m.documentMessage ||
    m.documentWithCaptionMessage ||
    m.stickerMessage
  );
}

// ─── Create adapted media (replaces new MessageMedia) ─────────────────

export function createAdaptedMedia(
  mimetype: string,
  data: string,
  filename?: string,
): AdaptedMedia {
  return { mimetype, data, filename };
}

// ─── Adapt a Baileys message to AdaptedMessage ────────────────────────

export function adaptMessage(sock: WASocket, rawMsg: WAMessage): AdaptedMessage {
  const jid = rawMsg.key.remoteJid || "";
  const isGroup = jid.endsWith("@g.us");
  const msgType = getMessageType(rawMsg);
  const body = extractText(rawMsg);

  // Extract vCards
  const vCards: string[] = [];
  const m = rawMsg.message;
  if (m?.contactMessage?.vcard) vCards.push(m.contactMessage.vcard);
  if (m?.contactsArrayMessage?.contacts) {
    for (const c of m.contactsArrayMessage.contacts) {
      if (c.vcard) vCards.push(c.vcard);
    }
  }

  // Quoted message detection
  const contextInfo =
    m?.extendedTextMessage?.contextInfo ||
    m?.imageMessage?.contextInfo ||
    m?.videoMessage?.contextInfo ||
    m?.audioMessage?.contextInfo ||
    m?.documentMessage?.contextInfo;
  const hasQuotedMsg = !!contextInfo?.quotedMessage;

  // Mentioned IDs
  const mentionedIds = contextInfo?.mentionedJid || [];

  return {
    from: jid,
    body,
    type: msgType,
    hasMedia: hasMediaContent(rawMsg),
    hasQuotedMsg,
    fromMe: !!rawMsg.key.fromMe,
    author: isGroup ? rawMsg.key.participant || undefined : undefined,
    timestamp: typeof rawMsg.messageTimestamp === "number"
      ? rawMsg.messageTimestamp
      : Number(rawMsg.messageTimestamp) || Math.floor(Date.now() / 1000),
    id: { _serialized: rawMsg.key.id || "" },
    mentionedIds,
    vCards,
    isStatus: jid === "status@broadcast",
    _raw: rawMsg,

    async reply(text: string): Promise<void> {
      await sock.sendMessage(jid, { text }, { quoted: rawMsg });
    },

    async react(emoji: string): Promise<void> {
      await sock.sendMessage(jid, {
        react: { text: emoji, key: rawMsg.key },
      });
    },

    async downloadMedia(): Promise<{ data: string; mimetype: string; filename?: string } | null> {
      try {
        const b = await loadBaileys();
        const buffer = await b.downloadMediaMessage(
          rawMsg,
          "buffer",
          {},
          { logger: undefined as any, reuploadRequest: sock.updateMediaMessage },
        );
        const mm = m?.imageMessage || m?.videoMessage || m?.audioMessage ||
          m?.documentMessage || m?.documentWithCaptionMessage?.message?.documentMessage ||
          m?.stickerMessage;
        const mimetype = (mm as any)?.mimetype || "application/octet-stream";
        const filename = (mm as any)?.fileName || undefined;
        return {
          data: Buffer.from(buffer as Buffer).toString("base64"),
          mimetype,
          filename,
        };
      } catch (err) {
        console.error("[baileys-adapter] downloadMedia failed:", err);
        return null;
      }
    },

    async getQuotedMessage(): Promise<AdaptedMessage | null> {
      if (!hasQuotedMsg || !contextInfo?.quotedMessage) return null;
      // Build a synthetic WAMessage for the quoted message
      const quotedRaw: WAMessage = {
        key: {
          remoteJid: jid,
          fromMe: contextInfo.participant === sock.user?.id,
          id: contextInfo.stanzaId || "",
          participant: isGroup ? contextInfo.participant || undefined : undefined,
        },
        message: contextInfo.quotedMessage as WAMessageContent,
        messageTimestamp: 0,
        pushName: "",
      } as any;
      return adaptMessage(sock, quotedRaw);
    },

    async getContact(): Promise<AdaptedContact> {
      const senderJid = isGroup ? (rawMsg.key.participant || jid) : jid;
      const number = senderJid.replace(/@.*/, "");
      return {
        number,
        pushname: rawMsg.pushName || "",
        name: rawMsg.pushName || number,
        _serialized: senderJid,
        async getProfilePicUrl() {
          try { return await sock.profilePictureUrl(senderJid, "image"); } catch { return undefined; }
        },
      };
    },

    async getChat(): Promise<AdaptedChat> {
      return createAdaptedChat(sock, jid, rawMsg);
    },
  };
}

// ─── Create an adapted chat object ────────────────────────────────────

async function createAdaptedChat(
  sock: WASocket,
  jid: string,
  rawMsg?: WAMessage,
): Promise<AdaptedChat> {
  const isGroup = jid.endsWith("@g.us");
  let name = jid;
  let participants: Array<{ id: { user: string; _serialized: string } }> | undefined;

  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      name = meta.subject || jid;
      participants = meta.participants.map((p) => ({
        id: { user: p.id.replace(/@.*/, ""), _serialized: p.id },
      }));
    } catch {
      name = jid;
    }
  } else {
    name = rawMsg?.pushName || jid.replace(/@.*/, "");
  }

  return {
    isGroup,
    name,
    id: { _serialized: jid },
    unreadCount: 0,
    participants,

    async sendSeen(): Promise<void> {
      try {
        if (rawMsg) {
          await sock.readMessages([rawMsg.key]);
        }
      } catch {}
    },

    async sendStateTyping(): Promise<void> {
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate("composing", jid);
      } catch {}
    },

    async fetchMessages(opts: { limit: number }): Promise<AdaptedMessage[]> {
      // Use the in-memory store (imported at call time to avoid circular deps)
      const { getRecentMessages } = require("./baileys-store");
      const rawMsgs = getRecentMessages(jid, opts.limit);
      return rawMsgs.map((rm: WAMessage) => adaptMessage(sock, rm));
    },
  };
}

// ─── Baileys send helper: convert AdaptedMedia to Baileys format ──────

export function buildSendContent(
  content: string | AdaptedMedia,
  options?: any,
): any {
  if (typeof content === "string") {
    return { text: content };
  }

  // It's AdaptedMedia
  const buffer = Buffer.from(content.data, "base64");
  const mime = content.mimetype || "application/octet-stream";

  // Voice note
  if (options?.sendAudioAsVoice) {
    return { audio: buffer, mimetype: mime, ptt: true };
  }

  // Image
  if (mime.startsWith("image/")) {
    return { image: buffer, caption: options?.caption, mimetype: mime };
  }

  // Video
  if (mime.startsWith("video/")) {
    return { video: buffer, caption: options?.caption, mimetype: mime };
  }

  // Audio
  if (mime.startsWith("audio/")) {
    return { audio: buffer, mimetype: mime };
  }

  // Document (default)
  return {
    document: buffer,
    mimetype: mime,
    fileName: content.filename || "file",
    caption: options?.caption,
  };
}
