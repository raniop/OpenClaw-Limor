/**
 * WhatsApp client setup and message routing.
 * Sub-modules handle media, owner commands, approval gating, and response dispatch.
 */
import { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import * as QRCode from "qrcode";
import * as http from "http";
import { sendMessage, extractFacts, setNotifyOwnerCallback, setSendMessageCallback, setSendFileCallback } from "../ai";
import { updateContact } from "../contacts";
import { getMemoryContext, saveExtractedFacts } from "../memory";
import { config } from "../config";
import { log } from "../logger";
import { conversationStore } from "../stores";
import { isGroupMuted, registerGroup } from "../muted-groups";
import { createTrace, elapsed, normalizeError, startTimer } from "../observability";
import type { TraceContext } from "../observability";
import { withChatLock } from "./chat-lock";
import { processMedia } from "./media-handler";
import { handleOwnerCommand } from "./owner-commands";
import { checkApprovalGate } from "./approval-gate";
import { handleResponse } from "./response-handler";
import { classifyGroupMessage } from "./group-classifier";
import { extractFollowups } from "../followups";
import { updateFromMessage } from "../relationship-memory";
import { approvalStore } from "../stores";

let latestQR: string | null = null;
let qrServer: http.Server | null = null;
let whatsappClient: Client | null = null;

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

async function sendToChat(chatId: string, text: string): Promise<void> {
  if (whatsappClient) {
    await whatsappClient.sendMessage(chatId, text);
  }
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

    setNotifyOwnerCallback(async (message: string) => {
      if (config.ownerChatId && whatsappClient) {
        await whatsappClient.sendMessage(config.ownerChatId, message);
        conversationStore.addMessage(config.ownerChatId, "assistant", message);
      }
    });

    setSendMessageCallback(async (chatId: string, message: string) => {
      if (whatsappClient) {
        await whatsappClient.sendMessage(chatId, message);
        conversationStore.addMessage(chatId, "assistant", message);
      }
    });

    setSendFileCallback(async (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => {
      if (whatsappClient) {
        const media = new MessageMedia(mimetype, base64, filename);
        await whatsappClient.sendMessage(chatId, media, { caption });
        conversationStore.addMessage(chatId, "assistant", caption || `📎 ${filename}`);
      }
    });
  });

  client.on("authenticated", () => { console.log("WhatsApp authenticated successfully."); });
  client.on("auth_failure", (msg: string) => { console.error("Authentication failed:", msg); });
  client.on("disconnected", (reason: string) => { console.log("Disconnected:", reason); });

  client.on("message", async (msg: Message) => {
    const chatId = msg.from;
    await withChatLock(chatId, () => handleMessage(msg));
  });

  return client;
}

async function handleMessage(msg: Message): Promise<void> {
  if (msg.fromMe) return;

  // --- Media processing ---
  const mediaTimer = startTimer();
  const mediaResult = await processMedia(msg);
  if ("error" in mediaResult) {
    await msg.reply(mediaResult.error);
    return;
  }
  const { body, imageData } = mediaResult.result;
  if (!body) return;
  const mediaDurationMs = mediaTimer.stop();

  // --- Contact info ---
  const chatId = msg.from;
  const contact = await msg.getContact();
  const phone = contact.number || chatId.replace(/@.*$/, "");
  const contactName = contact.pushname || contact.name || phone;
  updateContact(chatId, contactName, phone);

  const chat = await msg.getChat();
  const isGroup = chat.isGroup;
  if (isGroup) registerGroup(chat.name, chatId);
  const isOwner = !isGroup && chatId === config.ownerChatId;

  // --- Update relationship memory ---
  if (!isGroup) {
    try {
      updateFromMessage(chatId, contactName, body, {
        isOwner,
        isGroup,
        isApprovedContact: approvalStore.isApproved(chatId),
      });
    } catch (err) {
      console.error("[relationship] Update error:", err);
    }
  }

  // --- Create trace context ---
  const trace = createTrace({ chatId, contactName, phone, isGroup, isOwner });
  log.traceStart(trace);
  if (mediaDurationMs > 100) {
    log.mediaVoiceResult(body, mediaDurationMs, trace);
  }

  try {
    // --- Muted groups ---
    if (isGroup && isGroupMuted(chatId)) {
      log.traceEnd(trace, "muted_group", elapsed(trace));
      return;
    }

    // --- Group classifier pre-filter ---
    if (isGroup) {
      const classification = classifyGroupMessage(body, contactName);
      if (!classification.shouldRespond) {
        log.traceEnd(trace, "group_filtered", elapsed(trace));
        return;
      }
    }

    // --- Owner commands ---
    if (!isGroup && config.ownerChatId && chatId === config.ownerChatId) {
      const handled = await handleOwnerCommand({
        chatId, body,
        reply: (text) => msg.reply(text).then(() => {}),
        sendToChat,
        trace,
      });
      if (handled) {
        log.traceEnd(trace, "owner_command", elapsed(trace));
        return;
      }
    }

    // --- Approval gate ---
    if (!isGroup && chatId !== config.ownerChatId) {
      const blocked = await checkApprovalGate({
        chatId, phone, contactName, body,
        reply: (text) => msg.reply(text).then(() => {}),
        sendToChat,
        trace,
      });
      if (blocked) {
        log.traceEnd(trace, "approval_blocked", elapsed(trace));
        return;
      }
    }

    // --- Slash commands ---
    if (body === "/clear" || body === "/נקה") {
      conversationStore.clearHistory(chatId);
      await msg.reply("✨ ניקיתי הכל! יאללה מתחילים מחדש 😊");
      log.traceEnd(trace, "command_clear", elapsed(trace));
      return;
    }
    if (body === "/help" || body === "/עזרה") {
      await msg.reply(
        "🌟 *לימור* - העוזרת האישית שלך\n\n" +
        "היי! אני לימור 👋\nפשוט תכתוב לי ואני אענה!\n\n" +
        "🗣️ אני מדברת בכל שפה שתכתוב לי\n🧠 אני יודעת לעזור עם כל שאלה\n💻 כולל קוד, כתיבה, תרגום ועוד\n\n" +
        "⚡ *פקודות:*\n/clear או /נקה - איפוס שיחה\n/help או /עזרה - הודעה הזו"
      );
      log.traceEnd(trace, "command_help", elapsed(trace));
      return;
    }

    // --- AI conversation ---
    const messageForHistory = isGroup ? `[${contactName}]: ${body}` : body;
    conversationStore.addMessage(chatId, "user", messageForHistory);
    if (!isGroup) await chat.sendStateTyping();

    const memoryContext = getMemoryContext(chatId);
    const history = conversationStore.getHistory(chatId);
    const sender = { chatId, name: contactName, isOwner };

    if (imageData && history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.role === "user") lastMsg.imageData = imageData;
    }

    let extraContext = "";
    if (isGroup) {
      extraContext = `\n\nזו קבוצת וואטסאפ. ההודעה האחרונה נכתבה על ידי ${contactName}. תגיבי (טקסט בלבד, 1-2 משפטים) רק אם: (1) פונים אלייך בשם (לימור/Limor) (2) שואלים שאלה שמופנית אלייך (3) מגיבים למשהו שאמרת (4) שואלים שאלה כללית שלא פונה לאף אחד ספציפי. ⚠️ תחזירי [SKIP] (ולא ריאקציה!) אם: ההודעה פונה למישהו אחר, או שהיא שיחה בין אנשים שלא קשורה אלייך. אל תגיבי בריאקציה (אמוג'י) על הודעות בקבוצות שלא מכוונות אלייך! ריאקציה היא תגובה – אם לא היית עונה בטקסט, גם אל תגיבי בריאקציה. [SKIP] = שתיקה מוחלטת.`;
    }

    log.aiRequestStart(trace);
    const aiTimer = startTimer();
    const response = await sendMessage(history, (memoryContext || "") + extraContext, sender);
    const aiDurationMs = aiTimer.stop();
    log.aiRequestEnd(aiDurationMs, 0, trace); // tool count is tracked inside send-message

    const responseTimer = startTimer();
    await handleResponse(chatId, contactName, response,
      (text) => msg.reply(text).then(() => {}),
      (emoji) => msg.react(emoji),
      trace
    );
    const responseDurationMs = responseTimer.stop();

    // Determine outcome
    const outcome = response.trim() === "[SKIP]" ? "skip" :
      response.startsWith("[REACT:") ? "react" : "text";
    log.traceEnd(trace, outcome, elapsed(trace));

    // Background fact extraction
    extractFacts(history).then(({ name, facts }) => {
      if (name || facts.length > 0) saveExtractedFacts(chatId, facts, name || undefined);
    }).catch((err) => log.memorySaveError(String(err)));

    // Background followup extraction
    try {
      extractFollowups(response, chatId, contactName);
    } catch (err) {
      console.error("[followup] Extraction error:", err);
    }

  } catch (error) {
    const normalized = normalizeError(error, "handleMessage", trace.traceId);
    log.traceError(trace, normalized, elapsed(trace));
    await msg.reply("אוי, משהו השתבש 😅 נסה שוב בבקשה!");
  }
}
