import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import * as QRCode from "qrcode";
import * as http from "http";
import { sendMessage, extractFacts, setNotifyOwnerCallback, setSendMessageCallback, setSendFileCallback } from "./ai";
import { updateContact } from "./contacts";
import { getLastMeetingRequest, removeMeetingRequest } from "./meeting-requests";
import { createEvent } from "./calendar";
import { transcribeAudio } from "./transcribe";
import { addMessage, getHistory, clearHistory } from "./conversation";
import { getMemoryContext, saveExtractedFacts } from "./memory";
import { config } from "./config";
import { saveFile } from "./files";
import {
  isApproved,
  addApproved,
  isPending,
  addPending,
  getLastPending,
  approveByChatId,
} from "./pairing";
import { isGroupMuted, registerGroup } from "./muted-groups";

let latestQR: string | null = null;
let qrServer: http.Server | null = null;
let whatsappClient: Client | null = null;

// Per-chat lock to prevent double responses
const chatLocks = new Map<string, Promise<void>>();

async function withChatLock(chatId: string, fn: () => Promise<void>): Promise<void> {
  const prev = chatLocks.get(chatId) || Promise.resolve();
  const current = prev.then(fn, fn);
  chatLocks.set(chatId, current);
  await current;
}

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

export function getClient(): Client | null {
  return whatsappClient;
}

export function createWhatsAppClient(): Client {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr: string) => {
    latestQR = qr;
    console.log("Scan this QR code with WhatsApp:");
    qrcode.generate(qr, { small: true });
    startQRServer();
  });

  client.on("ready", () => {
    latestQR = null;
    whatsappClient = client;
    if (qrServer) { qrServer.close(); qrServer = null; }
    console.log("✨ לימור מחוברת ומוכנה! (Limor is ready!)");

    // Set up callback so AI can notify owner about meeting requests
    setNotifyOwnerCallback(async (message: string) => {
      if (config.ownerChatId && whatsappClient) {
        await whatsappClient.sendMessage(config.ownerChatId, message);
        // Add to owner's conversation history so Limor remembers what she sent
        addMessage(config.ownerChatId, "assistant", message);
      }
    });

    // Set up callback so AI can send messages to any contact
    setSendMessageCallback(async (chatId: string, message: string) => {
      if (whatsappClient) {
        await whatsappClient.sendMessage(chatId, message);
        // Add to recipient's conversation history so Limor remembers what she sent
        addMessage(chatId, "assistant", message);
      }
    });

    // Set up callback so AI can send files to contacts
    setSendFileCallback(async (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => {
      if (whatsappClient) {
        const media = new MessageMedia(mimetype, base64, filename);
        await whatsappClient.sendMessage(chatId, media, { caption });
        addMessage(chatId, "assistant", caption || `📎 ${filename}`);
      }
    });
  });

  client.on("authenticated", () => {
    console.log("WhatsApp authenticated successfully.");
  });

  client.on("auth_failure", (msg: string) => {
    console.error("Authentication failed:", msg);
  });

  client.on("disconnected", (reason: string) => {
    console.log("Disconnected:", reason);
  });

  client.on("message", async (msg: Message) => {
    const chatId = msg.from;
    await withChatLock(chatId, () => handleMessage(msg));
  });

  return client;
}

async function handleMessage(msg: Message): Promise<void> {
  try {
    // Skip messages from self
    if (msg.fromMe) return;

    // Handle voice messages
    let body = msg.body.trim();
    const isVoiceMessage = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio");

    if (isVoiceMessage) {
      try {
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const buffer = Buffer.from(media.data, "base64");
          console.log(`🎤 Voice message received, transcribing...`);
          body = await transcribeAudio(buffer, media.mimetype);
          console.log(`🎤 Transcribed: "${body}"`);
        }
      } catch (err) {
        console.error("Voice transcription failed:", err);
        await msg.reply("לא הצלחתי להבין את ההודעה הקולית 😅 אפשר לנסות שוב או לכתוב?");
        return;
      }
    }

    // Handle image messages
    let imageData: { base64: string; mediaType: string } | undefined;
    if (msg.hasMedia && msg.type === "image") {
      try {
        const media = await msg.downloadMedia();
        if (media && media.data) {
          console.log(`🖼️ Image received`);
          imageData = { base64: media.data, mediaType: media.mimetype };
          if (!body) body = "[תמונה]";
        }
      } catch (err) {
        console.error("Image download failed:", err);
      }
    }

    // Handle document messages - save to files directory
    if (msg.hasMedia && msg.type === "document") {
      try {
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const filename = (media as any).filename || `document_${Date.now()}`;
          const buffer = Buffer.from(media.data, "base64");
          saveFile(filename, buffer);
          if (!body) body = `[קובץ: ${filename}]`;
          console.log(`📎 Document saved: ${filename}`);
        }
      } catch (err) {
        console.error("Document download failed:", err);
      }
    }

    if (!body) return;

    const chatId = msg.from;
    const contact = await msg.getContact();
    const phone = contact.number || chatId.replace(/@.*$/, "");
    const contactName = contact.pushname || contact.name || phone;

    // Track contact for future messaging
    updateContact(chatId, contactName, phone);

    // Log chatId for setup
    console.log(`📩 Message from: ${chatId} (${contactName}, +${phone})`);

    // Skip pairing for group messages
    const chat = await msg.getChat();
    const isGroup = chat.isGroup;

    // Track group names for mute/unmute lookup
    if (isGroup) {
      registerGroup(chat.name, chatId);
    }

    // Skip muted groups entirely
    if (isGroup && isGroupMuted(chatId)) {
      return;
    }

    // Owner approval flow: if owner replies "כן"/"אשר" to approve pending contact
    if (!isGroup && config.ownerChatId && chatId === config.ownerChatId) {
      const approveWords = ["כן", "אשר", "yes", "approve", "אישור"];
      if (approveWords.includes(body.toLowerCase())) {
        const pending = getLastPending();
        if (pending) {
          approveByChatId(pending.chatId);
          await msg.reply(`✅ אישרתי את ${pending.phone}! עכשיו הם יכולים לדבר איתי.`);
          // Notify the approved contact
          if (whatsappClient) {
            await whatsappClient.sendMessage(
              pending.chatId,
              "🎉 אושרת! אני לימור, איך אפשר לעזור? 😊"
            );
          }
          return;
        }
      }

      // Check if owner is replying to a meeting request
      const meetingReq = getLastMeetingRequest();
      if (meetingReq) {
        // Owner replied with availability - pass to AI to parse and handle
        // Add context about the meeting request to the message
        addMessage(chatId, "user", body);
        const memoryContext = getMemoryContext(chatId);
        const history = getHistory(chatId);

        // Inject meeting request context
        const meetingContext = `\n\nהקשר: יש בקשת פגישה פתוחה מ-${meetingReq.requesterName} (chatId: ${meetingReq.requesterChatId}) בנושא "${meetingReq.topic}"${meetingReq.preferredTime ? ` (זמן מועדף: ${meetingReq.preferredTime})` : ""}. רני עכשיו עונה לגבי הזמינות שלו. אם הוא אישר או נתן תאריך ושעה – עשי את שני הדברים האלה: (1) קבעי את הפגישה ביומן עם create_event (2) שלחי הודעה ל-${meetingReq.requesterName} עם send_message שרני אישר ומתי הפגישה. חשוב: עשי את שניהם!`;

        const response = await sendMessage(
          history,
          (memoryContext || "") + meetingContext,
          { chatId, name: "רני", isOwner: true }
        );

        addMessage(chatId, "assistant", response);
        await msg.reply(response);

        // Don't manually notify requester - the AI already sends via send_message tool
        // Remove the handled request
        removeMeetingRequest(meetingReq.id);
        return;
      }
    }

    // Pairing check (skip for groups and owner)
    if (!isGroup && chatId !== config.ownerChatId && !isApproved(chatId)) {
      if (!isPending(chatId)) {
        addPending(chatId, `+${phone}`);
        // Notify owner
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(
            config.ownerChatId,
            `🔔 איש קשר חדש מנסה לדבר איתי!\n👤 שם: ${contactName}\n📱 מספר: +${phone}\n💬 הודעה: "${body}"\n\nלאשר? ענה *כן* או *אשר*`
          );
        }
      }
      await msg.reply(
        `היי ${contactName}! 👋 אני לימור, עוזרת אישית חכמה.\nאני צריכה אישור מהבעלים שלי לפני שנוכל לדבר. כבר שלחתי לו בקשה – אני אודיע לך ברגע שתאושר! ✨`
      );
      return;
    }

    // Handle commands
    if (body === "/clear" || body === "/נקה") {
      clearHistory(chatId);
      await msg.reply("✨ ניקיתי הכל! יאללה מתחילים מחדש 😊");
      return;
    }

    if (body === "/help" || body === "/עזרה") {
      await msg.reply(
        "🌟 *לימור* - העוזרת האישית שלך\n\n" +
          "היי! אני לימור 👋\n" +
          "פשוט תכתוב לי ואני אענה!\n\n" +
          "🗣️ אני מדברת בכל שפה שתכתוב לי\n" +
          "🧠 אני יודעת לעזור עם כל שאלה\n" +
          "💻 כולל קוד, כתיבה, תרגום ועוד\n\n" +
          "⚡ *פקודות:*\n" +
          "/clear או /נקה - איפוס שיחה\n" +
          "/help או /עזרה - הודעה הזו"
      );
      return;
    }

    // In groups, prefix message with sender name so Alma knows who wrote what
    const messageForHistory = isGroup ? `[${contactName}]: ${body}` : body;
    addMessage(chatId, "user", messageForHistory);

    // Show typing indicator
    await chat.sendStateTyping();

    // Load memory and get AI response
    const memoryContext = getMemoryContext(chatId);
    const history = getHistory(chatId);
    const isOwner = !isGroup && chatId === config.ownerChatId;
    const sender = { chatId, name: contactName, isOwner };

    // Attach image data to the last user message (transient, not persisted)
    if (imageData && history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.imageData = imageData;
      }
    }

    // Add group context
    let extraContext = "";
    if (isGroup) {
      extraContext = `\n\nזו קבוצת וואטסאפ. ההודעה האחרונה נכתבה על ידי ${contactName}. תגיבי אם: (1) פונים אלייך בשם (לימור/Limor) (2) שואלים שאלה שמופנית אלייך (3) מגיבים למשהו שאמרת או שואלים שאלת המשך על הודעה שלך (4) שואלים שאלה כללית שלא פונה לאף אחד ספציפי. תחזירי [SKIP] אם: (1) ההודעה פונה למישהו אחר בשם (דבורה, יוני, עמית, וכו') (2) ההודעה היא שיחה בין אנשים אחרים שלא קשורה אלייך. בקבוצות תשובות קצרות בלבד, 1-2 משפטים.`;
    }

    const response = await sendMessage(history, (memoryContext || "") + extraContext, sender);

    // In groups, skip if Alma decided not to respond
    if (response.trim() === "[SKIP]") {
      console.log(`⏭️ Skipping group message from ${contactName}`);
      return;
    }

    // Handle reaction-only: [REACT:emoji]
    const reactOnlyMatch = response.match(/^\[REACT:(.+?)\]$/);
    if (reactOnlyMatch) {
      const emoji = reactOnlyMatch[1];
      await msg.react(emoji);
      console.log(`😀 Reacted with ${emoji} to ${contactName}`);
      return;
    }

    // Handle reaction + text: [REACT:emoji] text
    const reactTextMatch = response.match(/^\[REACT:(.+?)\]\s*([\s\S]+)$/);
    if (reactTextMatch) {
      const emoji = reactTextMatch[1];
      const text = reactTextMatch[2].trim();
      await msg.react(emoji);
      addMessage(chatId, "assistant", text);
      await msg.reply(text);
      console.log(`😀 Reacted with ${emoji} and replied to ${contactName}`);
    } else {
      // Normal text response
      addMessage(chatId, "assistant", response);
      await msg.reply(response);
    }

    // Extract and save facts in background
    extractFacts(history).then(({ name, facts }) => {
      if (name || facts.length > 0) {
        saveExtractedFacts(chatId, facts, name || undefined);
      }
    }).catch((err) => console.error("Memory save error:", err));
  } catch (error) {
    console.error("Error handling message:", error);
    await msg.reply("אוי, משהו השתבש 😅 נסה שוב בבקשה!");
  }
}
