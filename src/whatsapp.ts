import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import * as QRCode from "qrcode";
import * as http from "http";
import { sendMessage, extractFacts, setNotifyOwnerCallback, setSendMessageCallback, setSendFileCallback } from "./ai";
import { updateContact } from "./contacts";
import { createEvent } from "./calendar";
import { transcribeAudio } from "./transcribe";
import { getMemoryContext, saveExtractedFacts } from "./memory";
import { config } from "./config";
import { saveFile } from "./files";
import { log } from "./logger";
import { approvalStore, meetingStore, conversationStore } from "./stores";
import { parseOwnerCommand } from "./command-parser";
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
    log.systemReady();

    // Set up callback so AI can notify owner about meeting requests
    setNotifyOwnerCallback(async (message: string) => {
      if (config.ownerChatId && whatsappClient) {
        await whatsappClient.sendMessage(config.ownerChatId, message);
        // Add to owner's conversation history so Limor remembers what she sent
        conversationStore.addMessage(config.ownerChatId, "assistant", message);
      }
    });

    // Set up callback so AI can send messages to any contact
    setSendMessageCallback(async (chatId: string, message: string) => {
      if (whatsappClient) {
        await whatsappClient.sendMessage(chatId, message);
        // Add to recipient's conversation history so Limor remembers what she sent
        conversationStore.addMessage(chatId, "assistant", message);
      }
    });

    // Set up callback so AI can send files to contacts
    setSendFileCallback(async (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => {
      if (whatsappClient) {
        const media = new MessageMedia(mimetype, base64, filename);
        await whatsappClient.sendMessage(chatId, media, { caption });
        conversationStore.addMessage(chatId, "assistant", caption || `📎 ${filename}`);
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
          log.mediaVoice();
          body = await transcribeAudio(buffer, media.mimetype);
          log.mediaVoiceResult(body);
        }
      } catch (err) {
        log.mediaError("voice", String(err));
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
          log.mediaImage();
          imageData = { base64: media.data, mediaType: media.mimetype };
          if (!body) body = "[תמונה]";
        }
      } catch (err) {
        log.mediaError("image", String(err));
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
          log.mediaDocument(filename);
        }
      } catch (err) {
        log.mediaError("document", String(err));
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
    log.msgReceived(chatId, contactName, phone, isVoiceMessage ? "voice" : msg.type);

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

    // Owner command flow: ID-based approval/rejection for contacts and meetings
    if (!isGroup && config.ownerChatId && chatId === config.ownerChatId) {
      const cmd = parseOwnerCommand(body);

      if (cmd?.type === "approve_contact") {
        const entry = approvalStore.approveByCode(cmd.code);
        if (entry) {
          log.approvalApproved(cmd.code, entry.phone);
          await msg.reply(`✅ אישרתי את ${entry.phone}! (קוד: ${cmd.code}) עכשיו הם יכולים לדבר איתי.`);
          if (whatsappClient) {
            await whatsappClient.sendMessage(entry.chatId, "🎉 אושרת! אני לימור, איך אפשר לעזור? 😊");
          }
        } else {
          log.approvalNotFound(cmd.code);
          await msg.reply(`❌ לא מצאתי בקשה עם קוד ${cmd.code}.`);
        }
        return;
      }

      if (cmd?.type === "reject_contact") {
        const entry = approvalStore.rejectByCode(cmd.code);
        if (entry) {
          log.approvalRejected(cmd.code, entry.phone);
          await msg.reply(`🚫 דחיתי את ${entry.phone} (קוד: ${cmd.code}).`);
        } else {
          log.approvalNotFound(cmd.code);
          await msg.reply(`❌ לא מצאתי בקשה עם קוד ${cmd.code}.`);
        }
        return;
      }

      if (cmd?.type === "bare_approve") {
        const pendingCount = approvalStore.getPendingCount();
        if (pendingCount === 1) {
          const pending = approvalStore.getLastPending();
          if (pending) {
            const entry = approvalStore.approveByCode(pending.code);
            if (entry) {
              await msg.reply(`✅ אישרתי את ${entry.phone}! עכשיו הם יכולים לדבר איתי.`);
              if (whatsappClient) {
                await whatsappClient.sendMessage(entry.chatId, "🎉 אושרת! אני לימור, איך אפשר לעזור? 😊");
              }
              return;
            }
          }
        } else if (pendingCount > 1) {
          log.approvalAmbiguous(pendingCount);
          const pending = approvalStore.getLastPending();
          await msg.reply(`⚠️ יש ${pendingCount} בקשות ממתינות. תציין קוד:\nלמשל: *אשר ${pending?.code || "XXXXXX"}*`);
          return;
        }
        // pendingCount === 0: fall through to meeting request check or normal AI
      }

      if (cmd?.type === "approve_meeting") {
        const meetingReq = meetingStore.getMeetingRequestById(cmd.id);
        if (!meetingReq) {
          await msg.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
          return;
        }
        // Pass to AI with meeting context (same as before)
        conversationStore.addMessage(chatId, "user", body);
        const memoryContext = getMemoryContext(chatId);
        const history = conversationStore.getHistory(chatId);
        const meetingContext = `\n\nהקשר: יש בקשת פגישה פתוחה מ-${meetingReq.requesterName} (chatId: ${meetingReq.requesterChatId}) בנושא "${meetingReq.topic}"${meetingReq.preferredTime ? ` (זמן מועדף: ${meetingReq.preferredTime})` : ""}. רני עכשיו מאשר את הפגישה. עשי את שני הדברים האלה: (1) קבעי את הפגישה ביומן עם create_event (2) שלחי הודעה ל-${meetingReq.requesterName} עם send_message שרני אישר ומתי הפגישה. חשוב: עשי את שניהם!`;
        const response = await sendMessage(history, (memoryContext || "") + meetingContext, { chatId, name: "רני", isOwner: true });
        conversationStore.addMessage(chatId, "assistant", response);
        await msg.reply(response);
        meetingStore.removeMeetingRequest(meetingReq.id);
        return;
      }

      if (cmd?.type === "reject_meeting") {
        const req = meetingStore.removeMeetingRequest(cmd.id);
        if (req) {
          await msg.reply(`🚫 דחיתי את בקשת הפגישה מ-${req.requesterName} (${cmd.id}).`);
        } else {
          await msg.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
        }
        return;
      }

      // --- Legacy: if owner sends any message and there's exactly 1 meeting request, treat as response ---
      const meetingCount = meetingStore.getMeetingRequestCount();
      if (meetingCount === 1) {
        const meetingReq = meetingStore.getLastMeetingRequest();
        if (meetingReq) {
          conversationStore.addMessage(chatId, "user", body);
          const memoryContext = getMemoryContext(chatId);
          const history = conversationStore.getHistory(chatId);
          const meetingContext = `\n\nהקשר: יש בקשת פגישה פתוחה (${meetingReq.id}) מ-${meetingReq.requesterName} (chatId: ${meetingReq.requesterChatId}) בנושא "${meetingReq.topic}"${meetingReq.preferredTime ? ` (זמן מועדף: ${meetingReq.preferredTime})` : ""}. רני עכשיו עונה לגבי הזמינות שלו. אם הוא אישר או נתן תאריך ושעה – עשי את שני הדברים האלה: (1) קבעי את הפגישה ביומן עם create_event (2) שלחי הודעה ל-${meetingReq.requesterName} עם send_message שרני אישר ומתי הפגישה. חשוב: עשי את שניהם!`;
          const response = await sendMessage(history, (memoryContext || "") + meetingContext, { chatId, name: "רני", isOwner: true });
          conversationStore.addMessage(chatId, "assistant", response);
          await msg.reply(response);
          meetingStore.removeMeetingRequest(meetingReq.id);
          return;
        }
      }
      // meetingCount > 1 or 0: fall through to normal AI processing
    }

    // Pairing check (skip for groups and owner)
    if (!isGroup && chatId !== config.ownerChatId && !approvalStore.isApproved(chatId)) {
      if (!approvalStore.isPending(chatId)) {
        const code = approvalStore.addPending(chatId, `+${phone}`);
        log.approvalNewContact(contactName, `+${phone}`, code);
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(
            config.ownerChatId,
            `🔔 איש קשר חדש מנסה לדבר איתי!\n👤 שם: ${contactName}\n📱 מספר: +${phone}\n💬 הודעה: "${body}"\n\n✅ לאשר: *אשר ${code}*\n🚫 לדחות: *דחה ${code}*`
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
      conversationStore.clearHistory(chatId);
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
    conversationStore.addMessage(chatId, "user", messageForHistory);

    // Show typing indicator
    await chat.sendStateTyping();

    // Load memory and get AI response
    const memoryContext = getMemoryContext(chatId);
    const history = conversationStore.getHistory(chatId);
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
      log.msgSkipGroup(contactName);
      return;
    }

    // Handle reaction-only: [REACT:emoji]
    const reactOnlyMatch = response.match(/^\[REACT:(.+?)\]$/);
    if (reactOnlyMatch) {
      const emoji = reactOnlyMatch[1];
      await msg.react(emoji);
      log.msgReact(emoji, contactName);
      return;
    }

    // Handle reaction + text: [REACT:emoji] text
    const reactTextMatch = response.match(/^\[REACT:(.+?)\]\s*([\s\S]+)$/);
    if (reactTextMatch) {
      const emoji = reactTextMatch[1];
      const text = reactTextMatch[2].trim();
      await msg.react(emoji);
      conversationStore.addMessage(chatId, "assistant", text);
      await msg.reply(text);
      log.msgReact(emoji, contactName);
    } else {
      // Normal text response
      conversationStore.addMessage(chatId, "assistant", response);
      await msg.reply(response);
    }

    // Extract and save facts in background
    extractFacts(history).then(({ name, facts }) => {
      if (name || facts.length > 0) {
        saveExtractedFacts(chatId, facts, name || undefined);
      }
    }).catch((err) => log.memorySaveError(String(err)));
  } catch (error) {
    log.systemError("Error handling message", String(error));
    await msg.reply("אוי, משהו השתבש 😅 נסה שוב בבקשה!");
  }
}
