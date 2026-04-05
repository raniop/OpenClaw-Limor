/**
 * Baileys WhatsApp Client — WebSocket-based connection (no Puppeteer/Chrome).
 * Provides an adapter interface compatible with the existing bot code.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  downloadMediaMessage,
  getContentType,
  WASocket,
} from "@whiskeysockets/baileys";
import { resolve } from "path";
import * as QRCode from "qrcode";
import * as http from "http";

// Use require for pino to avoid esModuleInterop issues
const pino = require("pino");

// ─── Types ────────────────────────────────────────────────────────────

export interface BaileysMessage {
  /** Sender JID: "972501234567@s.whatsapp.net" or "123@g.us" */
  from: string;
  /** Individual sender in groups */
  author: string | undefined;
  /** Message text body */
  body: string;
  /** Message type: "chat", "image", "ptt", "audio", "document", "vcard" */
  type: string;
  /** Has downloadable media */
  hasMedia: boolean;
  /** Sent by the bot itself */
  fromMe: boolean;
  /** Is a reply to another message */
  hasQuotedMsg: boolean;
  /** vCard data if type is vcard */
  vCards: string[];
  /** Mentioned JIDs */
  mentionedIds: string[];
  /** Download media → { data: base64, mimetype, filename? } */
  downloadMedia: () => Promise<{ data: string; mimetype: string; filename?: string } | null>;
  /** Reply to this message with text */
  reply: (text: string) => Promise<void>;
  /** React with emoji */
  react: (emoji: string) => Promise<void>;
  /** Get chat info */
  getChat: () => Promise<{ isGroup: boolean; name: string; id: { _serialized: string }; unreadCount: number; sendSeen: () => Promise<void>; sendStateTyping: () => Promise<void>; fetchMessages: (opts: { limit: number }) => Promise<BaileysMessage[]>; participants?: any[] }>;
  /** Get contact info */
  getContact: () => Promise<{ pushname: string; name: string; number: string; getProfilePicUrl?: () => Promise<string | undefined>; getAbout?: () => Promise<string> }>;
  /** Get the message this is replying to */
  getQuotedMessage: () => Promise<{ body: string; fromMe: boolean; getContact: () => Promise<{ pushname: string; name: string }> }>;
  /** Raw Baileys message (for internal use) */
  _raw: any;
}

// ─── State ────────────────────────────────────────────────────────────

let sock: WASocket | null = null;
let latestQR: string | null = null;
let qrServer: http.Server | null = null;
let isConnected = false;
let botJid = "";
// No in-memory store in Baileys v7 — we track state ourselves
const AUTH_DIR = resolve(__dirname, "..", "..", ".baileys_auth");

// ─── QR Server ────────────────────────────────────────────────────────

function startQRServer(): void {
  if (qrServer) return;
  qrServer = http.createServer(async (req, res) => {
    if (latestQR) {
      const svg = await QRCode.toString(latestQR, { type: "svg", width: 400 });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><title>OpenClaw QR</title>
        <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:white;font-family:sans-serif;}
        h1{margin-bottom:20px;}</style></head>
        <body><h1>🐾 OpenClaw - Scan with WhatsApp</h1>${svg}
        <p>Open WhatsApp > Settings > Linked Devices > Link a Device</p>
        <script>setTimeout(()=>location.reload(),20000)</script></body></html>`);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><title>OpenClaw QR</title>
        <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:white;font-family:sans-serif;}</style></head>
        <body><h1>✅ Connected! (or waiting for QR...)</h1>
        <script>setTimeout(()=>location.reload(),3000)</script></body></html>`);
    }
  });
  qrServer.listen(3847, () => {
    console.log("\\n📱 QR Code page: http://localhost:3847\\n");
  });
}

// ─── JID Helpers ──────────────────────────────────────────────────────

/** Convert @c.us format to @s.whatsapp.net (Baileys format) */
export function toBaileysJid(chatId: string): string {
  if (chatId.endsWith("@c.us")) {
    return chatId.replace("@c.us", "@s.whatsapp.net");
  }
  return chatId;
}

/** Convert @s.whatsapp.net back to @c.us for compatibility with stored data */
export function toLegacyJid(jid: string): string {
  if (jid.endsWith("@s.whatsapp.net")) {
    return jid.replace("@s.whatsapp.net", "@c.us");
  }
  return jid;
}

/** Get phone number from JID */
function phoneFromJid(jid: string): string {
  return jid.replace(/@.*$/, "");
}

// ─── Message Adapter ──────────────────────────────────────────────────

/** Extract text body from Baileys message */
function extractBody(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return "";
}

/** Determine message type from Baileys message */
function extractType(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return "chat";
  const contentType = getContentType(m);
  if (!contentType) return "chat";
  if (contentType === "imageMessage") return "image";
  if (contentType === "audioMessage") {
    return (m.audioMessage?.ptt) ? "ptt" : "audio";
  }
  if (contentType === "documentMessage") return "document";
  if (contentType === "videoMessage") return "video";
  if (contentType === "contactMessage" || contentType === "contactsArrayMessage") return "vcard";
  if (contentType === "stickerMessage") return "sticker";
  if (contentType === "conversation" || contentType === "extendedTextMessage") return "chat";
  return "chat";
}

/** Check if message has downloadable media */
function hasMediaContent(msg: proto.IWebMessageInfo): boolean {
  const type = extractType(msg);
  return ["image", "ptt", "audio", "document", "video", "sticker"].includes(type);
}

/** Extract vCard data from message */
function extractVCards(msg: proto.IWebMessageInfo): string[] {
  const m = msg.message;
  if (!m) return [];
  if (m.contactMessage?.vcard) return [m.contactMessage.vcard];
  if (m.contactsArrayMessage?.contacts) {
    return m.contactsArrayMessage.contacts
      .map(c => c.vcard)
      .filter((v): v is string => !!v);
  }
  return [];
}

/** Extract mentioned JIDs */
function extractMentionedIds(msg: proto.IWebMessageInfo): string[] {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid) return ctx.mentionedJid;
  return [];
}

/** Check if message is a reply */
function isQuotedMessage(msg: proto.IWebMessageInfo): boolean {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  return !!(ctx?.quotedMessage);
}

/** Wrap a raw Baileys message into our adapter interface */
export function wrapMessage(raw: any): BaileysMessage {
  const jid = raw.key.remoteJid || "";
  const isGroup = jid.endsWith("@g.us");
  const from = toLegacyJid(jid);
  const participant = raw.key.participant ? toLegacyJid(raw.key.participant) : undefined;
  const author = isGroup ? participant : undefined;

  return {
    from,
    author,
    body: extractBody(raw),
    type: extractType(raw),
    hasMedia: hasMediaContent(raw),
    fromMe: !!raw.key.fromMe,
    hasQuotedMsg: isQuotedMessage(raw),
    vCards: extractVCards(raw),
    mentionedIds: extractMentionedIds(raw).map(toLegacyJid),
    _raw: raw,

    downloadMedia: async () => {
      try {
        const buffer = await downloadMediaMessage(raw, "buffer", {});
        if (!buffer) return null;
        const m = raw.message;
        const contentType = getContentType(m!);
        let mimetype = "application/octet-stream";
        let filename: string | undefined;
        if (contentType && m) {
          const media = (m as any)[contentType];
          if (media?.mimetype) mimetype = media.mimetype;
          if (media?.fileName) filename = media.fileName;
        }
        return {
          data: Buffer.from(buffer as Buffer).toString("base64"),
          mimetype,
          filename,
        };
      } catch (err) {
        console.error("[baileys] Media download error:", err);
        return null;
      }
    },

    reply: async (text: string) => {
      if (!sock) return;
      await sock.sendMessage(jid, { text }, { quoted: raw });
    },

    react: async (emoji: string) => {
      if (!sock) return;
      await sock.sendMessage(jid, {
        react: { text: emoji, key: raw.key },
      });
    },

    getChat: async () => {
      const chatName = isGroup
        ? (await sock?.groupMetadata(jid).catch(() => null))?.subject || jid
        : raw.pushName || phoneFromJid(jid);

      return {
        isGroup,
        name: chatName,
        id: { _serialized: from },
        unreadCount: 0,
        sendSeen: async () => {
          if (sock) await sock.readMessages([raw.key]).catch(() => {});
        },
        sendStateTyping: async () => {
          if (sock) await sock.sendPresenceUpdate("composing", jid).catch(() => {});
        },
        fetchMessages: async (_opts: { limit: number }) => {
          // Not easily supported in Baileys — return empty
          return [];
        },
        participants: isGroup
          ? (await sock?.groupMetadata(jid).catch(() => null))?.participants
          : undefined,
      };
    },

    getContact: async () => {
      const name = raw.pushName || "";
      const phone = phoneFromJid(participant || jid);
      return {
        pushname: name,
        name: name,
        number: phone,
        getProfilePicUrl: async () => {
          try {
            return await sock?.profilePictureUrl(participant || jid, "image");
          } catch { return undefined; }
        },
        getAbout: async () => "",
      };
    },

    getQuotedMessage: async () => {
      const ctx = raw.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const quotedParticipant = ctx?.participant;
      const body = quoted?.conversation || quoted?.extendedTextMessage?.text || "(מדיה)";
      const isFromMe = quotedParticipant ? toLegacyJid(quotedParticipant) === toLegacyJid(botJid) : false;
      return {
        body,
        fromMe: isFromMe,
        getContact: async () => {
          const name = quotedParticipant ? phoneFromJid(quotedParticipant) : "";
          return { pushname: name, name };
        },
      };
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────

export function getSocket(): WASocket | null {
  return sock;
}

export function isSocketConnected(): boolean {
  return isConnected;
}

export function getBotJid(): string {
  return botJid;
}

/** Send a text message */
export async function sendTextMessage(chatId: string, text: string): Promise<void> {
  if (!sock) throw new Error("Not connected");
  await sock.sendMessage(toBaileysJid(chatId), { text });
}

/** Send media (image/document/voice) */
export async function sendMediaMessage(
  chatId: string,
  base64: string,
  filename: string,
  mimetype: string,
  caption?: string
): Promise<void> {
  if (!sock) throw new Error("Not connected");
  const buffer = Buffer.from(base64, "base64");
  const jid = toBaileysJid(chatId);

  if (mimetype.startsWith("image/")) {
    await sock.sendMessage(jid, { image: buffer, caption: caption || undefined });
  } else if (mimetype.startsWith("audio/")) {
    await sock.sendMessage(jid, { audio: buffer, ptt: true, mimetype });
  } else {
    await sock.sendMessage(jid, {
      document: buffer,
      mimetype,
      fileName: filename,
      caption: caption || undefined,
    });
  }
}

/** Send image from URL */
export async function sendImageFromUrl(
  chatId: string,
  imageUrl: string,
  caption: string
): Promise<void> {
  if (!sock) throw new Error("Not connected");
  const jid = toBaileysJid(chatId);
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await sock.sendMessage(jid, { image: buffer, caption });
  } catch (err) {
    // Fallback to text
    console.error("[baileys] Image send failed, sending text:", err);
    await sock.sendMessage(jid, { text: caption });
  }
}

/** Check if a phone number is registered on WhatsApp */
export async function isRegisteredUser(phone: string): Promise<boolean> {
  if (!sock) return false;
  try {
    const results = await sock.onWhatsApp(phone);
    return !!(results && results[0]?.exists);
  } catch { return false; }
}

/** Get number ID for a phone */
export async function getNumberId(phone: string): Promise<string | null> {
  if (!sock) return null;
  try {
    const results = await sock.onWhatsApp(phone);
    const result = results?.[0];
    return result?.jid ? toLegacyJid(result.jid) : null;
  } catch { return null; }
}

/** Get profile picture URL */
export async function getProfilePicUrl(jid: string): Promise<string | undefined> {
  if (!sock) return undefined;
  try {
    return await sock.profilePictureUrl(toBaileysJid(jid), "image");
  } catch { return undefined; }
}

/** Get group metadata */
export async function getGroupMetadata(groupJid: string) {
  if (!sock) return null;
  try {
    return await sock.groupMetadata(toBaileysJid(groupJid));
  } catch { return null; }
}

// ─── Connection ───────────────────────────────────────────────────────

export interface BaileysClientCallbacks {
  onReady: () => void;
  onMessage: (msg: BaileysMessage) => void;
  onDisconnected: (reason: string) => void;
}

export async function connectBaileys(callbacks: BaileysClientCallbacks): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["Limor", "Chrome", "120.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // Save credentials on update
  sock.ev.on("creds.update", saveCreds);

  // Connection updates (QR, connected, disconnected)
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      console.log("[baileys] QR code received — scan with WhatsApp");
      startQRServer();
    }

    if (connection === "open") {
      latestQR = null;
      isConnected = true;
      botJid = sock?.user?.id || "";
      console.log(`[baileys] Connected! Bot JID: ${botJid}`);
      if (qrServer) { qrServer.close(); qrServer = null; }
      callbacks.onReady();
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.error(`[baileys] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Reconnect after delay
        setTimeout(() => {
          console.log("[baileys] Reconnecting...");
          connectBaileys(callbacks).catch((err) => {
            console.error("[baileys] Reconnect failed:", err);
            process.exit(1);
          });
        }, 10000);
      } else {
        console.error("[baileys] Logged out. Need to re-scan QR. Exiting for PM2 restart.");
        callbacks.onDisconnected("logged_out");
        process.exit(1);
      }
    }
  });

  // Incoming messages
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return; // Only process new messages, not history sync

    for (const raw of messages) {
      if (!raw.message) continue; // Skip empty/protocol messages
      if (raw.key.fromMe) continue; // Skip own messages

      // Skip status broadcasts
      if (raw.key.remoteJid === "status@broadcast") continue;

      const wrapped = wrapMessage(raw);
      callbacks.onMessage(wrapped);
    }
  });
}

/** Graceful disconnect */
export async function disconnectBaileys(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      sock.end(undefined);
    }
    sock = null;
    isConnected = false;
  }
}
