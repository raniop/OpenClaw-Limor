/**
 * WhatsApp client setup and message routing.
 * Sub-modules handle media, owner commands, approval gating, and response dispatch.
 */
import { resolve } from "path";
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
import { getResolvedContext, formatCompressedContextForPrompt, formatDebugTrace, applyFollowupAutomation } from "../context";
import type { ResolvedContext } from "../context";
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

    // Process unread messages that arrived while bot was offline
    processUnreadMessages(client).catch((err) =>
      console.error("[unread] Failed to process unread messages:", err)
    );

    // Poll for pending notifications from dashboard (e.g., followup completion)
    startNotificationPoller(client);

    // Poll for delivery SMS alerts
    try {
      const { startDeliveryPoller } = require("../sms");
      startDeliveryPoller(async (text: string) => {
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(config.ownerChatId, text);
        }
      });
    } catch (err) {
      console.error("[sms] Failed to start delivery poller:", err);
    }

    // Poll Telegram alert channel for rocket/missile alerts
    try {
      const { startAlertPoller } = require("../telegram/alert-poller");
      startAlertPoller(async (text: string) => {
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(config.ownerChatId, text);
        }
      });
    } catch (err) {
      console.error("[telegram] Failed to start alert poller:", err);
    }
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

/**
 * Process unread messages that arrived while the bot was offline.
 * Fetches all chats with unread messages and processes each one.
 */
/**
 * Poll for pending notifications from the dashboard (e.g., followup completed → notify requester).
 */
function startNotificationPoller(client: Client): void {
  const { statePath } = require("../state-dir");
  const notifyPath = statePath("pending-notifications.json");
  const { readFileSync, writeFileSync, existsSync } = require("fs");

  setInterval(() => {
    try {
      if (!existsSync(notifyPath)) return;
      const content = readFileSync(notifyPath, "utf-8").trim();
      if (!content || content === "[]") return;

      const notifications = JSON.parse(content);
      if (!Array.isArray(notifications) || notifications.length === 0) return;

      // Send each notification
      for (const n of notifications) {
        if (n.chatId && n.message) {
          client.sendMessage(n.chatId, n.message).catch((err: any) =>
            console.error(`[notify] Failed to send to ${n.chatId}:`, err.message)
          );
          console.log(`[notify] Sent completion notification to ${n.chatId}`);
        }
      }

      // Clear the file
      writeFileSync(notifyPath, "[]", "utf-8");
    } catch {}
  }, 5000); // Check every 5 seconds

  console.log("[notify] Notification poller started");
}

async function processUnreadMessages(client: Client): Promise<void> {
  console.log("[unread] Checking for unread messages...");
  try {
    const chats = await client.getChats();
    const unreadChats = chats.filter((chat) => chat.unreadCount > 0);

    if (unreadChats.length === 0) {
      console.log("[unread] No unread messages found");
      return;
    }

    console.log(`[unread] Found ${unreadChats.length} chats with unread messages`);

    for (const chat of unreadChats) {
      try {
        // Fetch unread messages from this chat
        const messages = await chat.fetchMessages({ limit: chat.unreadCount });
        const unreadFromOthers = messages.filter((m) => !m.fromMe);

        if (unreadFromOthers.length === 0) continue;

        console.log(`[unread] Processing ${unreadFromOthers.length} unread messages from ${chat.name || chat.id._serialized}`);

        // Process each unread message through the normal flow
        for (const msg of unreadFromOthers) {
          try {
            await withChatLock(msg.from, () => handleMessage(msg));
          } catch (err) {
            console.error(`[unread] Error processing message from ${msg.from}:`, err);
          }
        }

        // Mark chat as read
        await chat.sendSeen();
      } catch (err) {
        console.error(`[unread] Error processing chat ${chat.name}:`, err);
      }
    }

    console.log("[unread] Finished processing unread messages");
  } catch (err) {
    console.error("[unread] Error fetching chats:", err);
  }
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
  let { body, imageData } = mediaResult.result;

  // --- vCard (contact card) processing: auto-add contacts from owner ---
  if (msg.type === "vcard" && (msg as any).vCards?.length > 0) {
    const vcards: string[] = (msg as any).vCards;
    const parsed = vcards.map(parseVCard).filter(Boolean) as Array<{ name: string; phone: string }>;
    if (parsed.length > 0) {
      const { addManualContact } = require("../contacts");
      const { approvalStore: aStore } = require("../stores");
      const results: string[] = [];
      for (const c of parsed) {
        const result = addManualContact(c.name, c.phone);
        const cleanPhone = c.phone.replace(/\D/g, "");
        if (cleanPhone) aStore.addApproved(`manual_${cleanPhone}`);
        results.push(`${c.name} (${c.phone}): ${result}`);
        console.log(`[vcard] Auto-added: ${c.name} ${c.phone} → ${result}`);
      }
      body = `[כרטיס איש קשר שנשמר אוטומטית]\n${results.join("\n")}`;
    }
  }

  if (!body) return;
  const mediaDurationMs = mediaTimer.stop();

  // --- Quoted message context ---
  if (msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      const quotedText = quotedMsg.body || "(מדיה)";
      body = `[בתגובה ל: ${quotedText}]\n${body}`;
    } catch (err) {
      console.error("[quoted] Failed to get quoted message:", err);
    }
  }

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

    // --- Build context engine ---
    let extraContext = "";
    let allowTools = true;
    let allowedToolNames: string[] | undefined;
    let resolvedCtx: ResolvedContext | undefined;
    try {
      resolvedCtx = getResolvedContext(chatId, body, { name: contactName, isOwner, isGroup });
      extraContext = "\n\n" + formatCompressedContextForPrompt(resolvedCtx);
      allowTools = resolvedCtx.executionDecision.allowTools;
      if (resolvedCtx.toolRoutingPolicy.allowedToolNames.length > 0) {
        allowedToolNames = resolvedCtx.toolRoutingPolicy.allowedToolNames;
      }
      console.log(`[brain] ${resolvedCtx.debugTrace.summary}`);
      if (process.env.DEBUG_BRAIN_TRACE === "true") {
        console.log(formatDebugTrace(resolvedCtx));
      }
    } catch (err) {
      console.error("[context] Failed to build context:", err);
    }

    if (isGroup) {
      extraContext += `\n\nזו קבוצת וואטסאפ. ההודעה האחרונה נכתבה על ידי ${contactName}. תגיבי (טקסט בלבד, 1-2 משפטים) רק אם: (1) פונים אלייך בשם (לימור/Limor) (2) שואלים שאלה שמופנית אלייך (3) מגיבים למשהו שאמרת (4) שואלים שאלה כללית שלא פונה לאף אחד ספציפי. ⚠️ תחזירי [SKIP] (ולא ריאקציה!) אם: ההודעה פונה למישהו אחר, או שהיא שיחה בין אנשים שלא קשורה אלייך. אל תגיבי בריאקציה (אמוג'י) על הודעות בקבוצות שלא מכוונות אלייך! ריאקציה היא תגובה – אם לא היית עונה בטקסט, גם אל תגיבי בריאקציה. [SKIP] = שתיקה מוחלטת.`;
    }

    log.aiRequestStart(trace);
    const aiTimer = startTimer();
    const response = await sendMessage(history, (memoryContext || "") + extraContext, sender, { allowTools, allowedToolNames });
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

    // --- Followup automation ---
    if (resolvedCtx) {
      try {
        const fuDecision = applyFollowupAutomation(resolvedCtx);
        if (fuDecision.action === "create_followup") {
          console.log(`[followup:auto] created: ${fuDecision.suggestedReason}`);
        } else if (fuDecision.action === "skip_existing") {
          console.log("[followup:auto] duplicate avoided");
        }
      } catch (err) {
        console.error("[followup:auto] Error:", err);
      }
    }

    // Background fact extraction
    extractFacts(history).then(({ name, facts }) => {
      if (name || facts.length > 0) saveExtractedFacts(chatId, facts, name || undefined);
    }).catch((err) => log.memorySaveError(String(err)));

    // Background followup extraction (skip if create_reminder tool was already used)
    try {
      if (!response.includes("תזכורת נוצרה")) {
        extractFollowups(response, chatId, contactName, body);
      }
    } catch (err) {
      console.error("[followup] Extraction error:", err);
    }

    // Background contact sync (keeps contacts.json in sync with relationships)
    try {
      const { syncContacts } = require("../sync-contacts");
      syncContacts();
    } catch (err) {
      console.error("[sync] Contact sync error:", err);
    }

  } catch (error) {
    const normalized = normalizeError(error, "handleMessage", trace.traceId);
    log.traceError(trace, normalized, elapsed(trace));
    await msg.reply("אוי, משהו השתבש 😅 נסה שוב בבקשה!");
  }
}

function parseVCard(vcard: string): { name: string; phone: string } | null {
  try {
    const fnMatch = vcard.match(/FN[;:](.+)/i);
    // Try waid= first (WhatsApp ID — cleanest source), then TEL line
    const waidMatch = vcard.match(/waid=(\d+)/i);
    const telMatch = vcard.match(/TEL[^:]*:([^\n]+)/i);
    const name = fnMatch?.[1]?.trim();
    const phone = waidMatch?.[1] || telMatch?.[1]?.replace(/\D/g, "");
    if (name && phone && phone.length >= 10) return { name, phone };
  } catch {}
  return null;
}
