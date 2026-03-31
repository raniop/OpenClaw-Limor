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
import { getMemoryContext, saveExtractedFacts, saveEmotionalState, savePreference } from "../memory";
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
import { classifyGroupMessage, recordGroupResponse, hasRecentGroupResponse, filterGroupMessage, isBotContact } from "./group-classifier";
import { trackMessage as trackThread, formatThreadContext, isPartOfOtherThread } from "./thread-tracker";
import { getResolvedContext, formatCompressedContextForPrompt, formatDebugTrace, applyFollowupAutomation } from "../context";
import type { ResolvedContext } from "../context";
import { setPersistedState, clearState as clearConversationState, saveContextSnapshot, getContextSnapshot } from "../context/conversation-state-store";
import { selectRelevantHistory } from "../context/history-selector";
import { getRelevantTopicSegments } from "../context/topic-retriever";
import { extractFollowups } from "../followups";
import { updateFromMessage } from "../relationship-memory";
import { approvalStore } from "../stores";
import { learnFromCorrection } from "../context/correction-learner";
import { startProactiveScheduler, recordOwnerResponse } from "../proactive";
import { buildOperationalTrace, saveOperationalTrace, formatTraceSummary, runSelfCheck } from "../ops";
import { startDeliveryPoller, startSmsWatcher } from "../sms";
import { startAlertPoller } from "../telegram/alert-poller";
import { statePath } from "../state-dir";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { addManualContact } from "../contacts";
import { trackGroupPerson, getGroupPeopleContext } from "../conversation";
import { syncContacts } from "../sync-contacts";

let latestQR: string | null = null;
let qrServer: http.Server | null = null;
let whatsappClient: Client | null = null;
let limorWhatsAppId: string = "";

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

function findChromePath(): string | undefined {
  try {
    const puppeteer = require("puppeteer");
    return puppeteer.executablePath();
  } catch {}
  return undefined;
}

export function createWhatsAppClient(): Client {
  const executablePath = findChromePath();
  if (executablePath) {
    console.log(`[chrome] Using: ${executablePath}`);
  }

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath,
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
    try {
      limorWhatsAppId = client.info.wid._serialized;
      console.log(`[whatsapp] Bot ID: ${limorWhatsAppId}`);
      console.log(`[whatsapp] client.info.me:`, JSON.stringify((client.info as any).me));
    } catch {}
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
      startDeliveryPoller(async (text: string) => {
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(config.ownerChatId, text);
        }
      });
    } catch (err) {
      console.error("[sms] Failed to start delivery poller:", err);
    }

    // SMS Sender Watcher — forwards SMS from specific senders (e.g. HAREL) to owner via WhatsApp
    try {
      startSmsWatcher(async (text: string) => {
        if (config.ownerChatId && whatsappClient) {
          await whatsappClient.sendMessage(config.ownerChatId, text);
          conversationStore.addMessage(config.ownerChatId, "assistant", text);
        }
      });
    } catch (err) {
      console.error("[sms-watcher] Failed to start SMS watcher:", err);
    }

    // Poll Telegram alert channel for rocket/missile alerts
    try {
      startAlertPoller(
        // Text-only callback
        async (text: string) => {
          if (config.ownerChatId && whatsappClient) {
            await whatsappClient.sendMessage(config.ownerChatId, text);
          }
        },
        // Image + caption callback — uses fetch() instead of MessageMedia.fromUrl()
        // to avoid Puppeteer "detached Frame" errors
        async (imageUrl: string, caption: string) => {
          if (config.ownerChatId && whatsappClient) {
            try {
              const imageResponse = await fetch(imageUrl);
              if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
              const buffer = Buffer.from(await imageResponse.arrayBuffer());
              const base64 = buffer.toString("base64");
              const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
              const media = new MessageMedia(contentType, base64, "telegram-image.jpg");
              await whatsappClient.sendMessage(config.ownerChatId, media, { caption });
            } catch (imgErr) {
              // Fallback to text if image download fails
              console.error("[telegram] Image download failed, sending text only:", imgErr);
              await whatsappClient.sendMessage(config.ownerChatId, caption);
            }
          }
        }
      );
    } catch (err) {
      console.error("[telegram] Failed to start alert poller:", err);
    }

    // Start proactive messaging scheduler
    try {
      startProactiveScheduler();
    } catch (err) {
      console.error("[proactive] Failed to start scheduler:", err);
    }
  });

  client.on("authenticated", () => { console.log("WhatsApp authenticated successfully."); });
  client.on("auth_failure", (msg: string) => { console.error("Authentication failed:", msg); });
  client.on("disconnected", (reason: string) => {
    console.error(`[whatsapp] ⚠️ Disconnected: ${reason}. Restarting in 10 seconds...`);
    whatsappClient = null;
    setTimeout(() => {
      console.log("[whatsapp] Attempting reconnect...");
      client.initialize().catch((err) => {
        console.error("[whatsapp] Reconnect failed, exiting for PM2 restart:", err);
        process.exit(1); // PM2 will restart us
      });
    }, 10000);
  });

  // Detect stale connection — if no WhatsApp activity for 5 minutes, health check
  let lastActivity = Date.now();
  const originalEmit = client.emit.bind(client);
  client.emit = function (event: string, ...args: any[]) {
    lastActivity = Date.now();
    return originalEmit(event, ...args);
  } as any;

  setInterval(() => {
    const silenceMs = Date.now() - lastActivity;
    // If no activity for 10 minutes and we think we're connected, check
    if (silenceMs > 10 * 60 * 1000 && whatsappClient) {
      console.warn(`[whatsapp] No activity for ${Math.round(silenceMs / 60000)} minutes. Testing connection...`);
      client.getState().then((state) => {
        if (state !== "CONNECTED") {
          console.error(`[whatsapp] State is ${state}, not CONNECTED. Exiting for PM2 restart.`);
          process.exit(1);
        } else {
          console.log(`[whatsapp] Health check OK — state: ${state}`);
        }
      }).catch((err) => {
        console.error("[whatsapp] Health check failed, exiting for PM2 restart:", err);
        process.exit(1);
      });
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

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
  const notifyPath = statePath("pending-notifications.json");

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
  const isVoiceMessage = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio");
  const mediaTimer = startTimer();
  const mediaResult = await processMedia(msg);
  if ("error" in mediaResult) {
    await msg.reply(mediaResult.error);
    return;
  }
  let { body, imageData } = mediaResult.result;

  // --- vCard (contact card) processing: ONLY from owner ---
  const chatIdForVcard = msg.from;
  const isOwnerVcard = !msg.from.includes("@g.us") && chatIdForVcard === config.ownerChatId;
  if (isOwnerVcard && msg.type === "vcard" && (msg as any).vCards?.length > 0) {
    const vcards: string[] = (msg as any).vCards;
    const parsed = vcards.map(parseVCard).filter(Boolean) as Array<{ name: string; phone: string }>;
    if (parsed.length > 0) {
      const results: string[] = [];
      for (const c of parsed) {
        const result = addManualContact(c.name, c.phone);
        const cleanPhone = c.phone.replace(/\D/g, "");
        if (cleanPhone) approvalStore.addApproved(`manual_${cleanPhone}`);
        results.push(`${c.name} (${c.phone}): ${result}`);
        console.log(`[vcard] Auto-added: ${c.name} ${c.phone} → ${result}`);
      }
      body = `[כרטיס איש קשר שנשמר אוטומטית]\n${results.join("\n")}`;
    }
  }

  if (!body) return;
  const mediaDurationMs = mediaTimer.stop();

  // --- Quoted message context ---
  let quotedSenderName = ""; // Track who was replied to (for thread tracking)
  let quotedMsgFromMe = false; // Was the quoted message from Limor herself?
  if (msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      quotedMsgFromMe = !!quotedMsg.fromMe;
      const quotedText = quotedMsg.body || "(מדיה)";
      // Include quoted message sender name so AI knows who the reply is directed at
      try {
        const quotedContact = await quotedMsg.getContact();
        quotedSenderName = quotedContact.pushname || quotedContact.name || "";
      } catch {}
      const senderPrefix = quotedSenderName ? `${quotedSenderName}: ` : "";
      body = `[בתגובה ל: ${senderPrefix}${quotedText}]\n${body}`;
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

  // In groups, also track the individual sender (msg.author) as a contact
  // This links group participants to their personal chatId so we recognize them everywhere
  if (isGroup && msg.author) {
    try {
      const authorContact = await msg.getContact();
      const authorPhone = authorContact.number || msg.author.replace(/@.*$/, "");
      const authorName = authorContact.pushname || authorContact.name || authorPhone;
      updateContact(msg.author, authorName, authorPhone);
    } catch (err) {
      // Silently ignore — author tracking is best-effort
    }
  }

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
    // --- Track conversation threads in groups ---
    if (isGroup) {
      trackThread(chatId, contactName, quotedSenderName || undefined, body.substring(0, 50));
    }

    // --- Muted groups ---
    if (isGroup && isGroupMuted(chatId)) {
      // Still save to history so owner can ask "what happened in the group" later
      const messageForHistory = `[${contactName}]: ${body}`;
      conversationStore.addMessage(chatId, "user", messageForHistory);
      try {
        trackGroupPerson(chatId, contactName, body);
      } catch {}
      log.traceEnd(trace, "muted_group", elapsed(trace));
      return;
    }

    // --- Group pre-filter: deterministic skip before AI call ---
    if (isGroup) {
      const mentionsLimor = new RegExp(`(^|\\s)${config.botName}($|\\s|[?.!,])`, "i").test(body) || new RegExp(`\\b${config.botNameEn}\\b`, "i").test(body);
      const inOtherThread = isPartOfOtherThread(chatId, contactName);
      const mentionedIds: string[] = (msg as any).mentionedIds || [];

      const filterResult = filterGroupMessage({
        body, contactName, chatId,
        mentionedIds,
        hasQuotedMsg: msg.hasQuotedMsg,
        quotedSenderName,
        quotedMsgFromMe,
        senderIsBot: isBotContact(contactName),
        limorMentioned: mentionsLimor,
        inOtherThread,
        limorWhatsAppId,
      });

      if (filterResult.verdict === "must_skip") {
        // Save to history for context, but skip AI call
        const messageForHistory = `[${contactName}]: ${body}`;
        conversationStore.addMessage(chatId, "user", messageForHistory);
        try { trackGroupPerson(chatId, contactName, body); } catch {}
        console.log(`[group-filter] SKIP: ${filterResult.reason} | ${contactName} in ${chat.name}`);
        log.traceEnd(trace, "group_filtered", elapsed(trace));
        return;
      }
      // Store verdict for context injection later
      (trace as any)._groupFilter = filterResult;
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
      clearConversationState(chatId);
      await msg.reply("✨ ניקיתי הכל! יאללה מתחילים מחדש 😊");
      log.traceEnd(trace, "command_clear", elapsed(trace));
      return;
    }
    if (body === "/help" || body === "/עזרה") {
      await msg.reply(
        `🌟 *${config.botName}* - העוזרת האישית שלך\n\n` +
        `היי! אני ${config.botName} 👋\nפשוט תכתוב לי ואני אענה!\n\n` +
        "🗣️ אני מדברת בכל שפה שתכתוב לי\n🧠 אני יודעת לעזור עם כל שאלה\n💻 כולל קוד, כתיבה, תרגום ועוד\n\n" +
        "⚡ *פקודות:*\n/clear או /נקה - איפוס שיחה\n/help או /עזרה - הודעה הזו"
      );
      log.traceEnd(trace, "command_help", elapsed(trace));
      return;
    }

    // Track owner messages for proactive rate limiting
    if (isOwner) {
      recordOwnerResponse();
    }

    // --- AI conversation ---
    // Mark as read (blue checkmarks) and show typing indicator
    try { await chat.sendSeen(); } catch {}
    const messageForHistory = isGroup ? `[${contactName}]: ${body}` : body;
    conversationStore.addMessage(chatId, "user", messageForHistory);
    try { await chat.sendStateTyping(); } catch {}

    // Track per-person activity in groups
    if (isGroup) {
      try {
        trackGroupPerson(chatId, contactName, body);
      } catch {}
    }

    const memoryContext = getMemoryContext(chatId);
    const conversationSummary = conversationStore.getSummary(chatId);
    const fullHistory = conversationStore.getHistory(chatId);
    const sender = { chatId, name: contactName, isOwner };

    // Smart history selection — pick most relevant messages instead of sending all 200
    const history = selectRelevantHistory(fullHistory, body);

    if (imageData && history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.role === "user") lastMsg.imageData = imageData;
    }

    // --- Build context engine ---
    let extraContext = "";
    let allowTools = true;
    let allowedToolNames: string[] | undefined;
    let resolvedCtx: ResolvedContext | undefined;

    // Inject conversation summary if history was trimmed
    if (conversationSummary) {
      extraContext += `\n\n⚠️ שים לב: יש היסטוריה ישנה שלא נראית בשיחה הנוכחית. סיכום: ${conversationSummary}`;
    }

    // Inject relevant topic segments from past conversations
    try {
      const topicContext = getRelevantTopicSegments(chatId, body);
      if (topicContext) extraContext += "\n\n" + topicContext;
    } catch {}

    // Restore context snapshot after restart (if available and recent)
    try {
      const savedSnapshot = getContextSnapshot(chatId);
      if (savedSnapshot) {
        extraContext += `\n\n📋 הקשר שיחה שנשמר (לפני restart): ${savedSnapshot}`;
      }
    } catch {}

    try {
      resolvedCtx = getResolvedContext(chatId, body, { name: contactName, isOwner, isGroup });
      extraContext += "\n\n" + formatCompressedContextForPrompt(resolvedCtx);
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
      // Add per-person group memory
      try {
        const groupPeopleCtx = getGroupPeopleContext(chatId);
        if (groupPeopleCtx) extraContext += "\n\n" + groupPeopleCtx;
      } catch {}

      const filterResult = (trace as any)._groupFilter as { verdict: string; reason: string } | undefined;
      const recentlyResponded = hasRecentGroupResponse(chatId);

      // Thread context — show active conversations
      const threadCtx = formatThreadContext(chatId, contactName);
      if (threadCtx) extraContext += "\n\n" + threadCtx;

      extraContext += `\n\nזו קבוצת וואטסאפ. ההודעה האחרונה נכתבה על ידי ${contactName}.`;
      if (filterResult?.verdict === "must_respond") {
        extraContext += ` ⚠️ פנו אלייך ישירות — חובה להגיב!`;
      } else if (recentlyResponded) {
        extraContext += ` ⚠️ הגבת לאחרונה בקבוצה — סביר שההודעה הזו היא המשך שיחה איתך.`;
      }
      extraContext += ` תגיבי (טקסט בלבד, 1-2 משפטים) אם: (1) פונים אלייך בשם (${config.botName}/${config.botNameEn}) (2) מגיבים (reply) להודעה שלך. תחזירי [SKIP] אם: ההודעה שייכת לשיחה בין אנשים אחרים, reply למישהו אחר, או לא קשורה אלייך.`;
    }

    // Build model routing params from resolved context
    const modelRouting = resolvedCtx ? {
      isOwner,
      isGroup,
      turnIntent: resolvedCtx.bundle.turnIntent.category,
      toolIntentType: resolvedCtx.toolIntent.type,
    } : undefined;

    // Save context snapshot for restart recovery
    if (resolvedCtx) {
      try { saveContextSnapshot(chatId, resolvedCtx.debugTrace.summary); } catch {}
    }

    log.aiRequestStart(trace);
    const aiTimer = startTimer();
    const sendResult = await sendMessage(history, (memoryContext || "") + extraContext, sender, { allowTools, allowedToolNames, modelRouting });
    const response = sendResult.text;
    const toolsUsedInMessage = sendResult.toolsUsed;
    const aiDurationMs = aiTimer.stop();
    log.aiRequestEnd(aiDurationMs, toolsUsedInMessage.length, trace);

    const responseTimer = startTimer();
    await handleResponse(chatId, contactName, response,
      (text) => msg.reply(text).then(() => {}),
      (emoji) => msg.react(emoji),
      trace,
      {
        isVoice: isVoiceMessage,
        sendVoice: isVoiceMessage && whatsappClient ? async (base64: string, mimetype: string) => {
          const voiceMedia = new MessageMedia(mimetype, base64, "voice.mp3");
          await whatsappClient!.sendMessage(chatId, voiceMedia, { sendAudioAsVoice: true });
        } : undefined,
      }
    );
    const responseDurationMs = responseTimer.stop();

    // Determine outcome
    const outcome = response.trim() === "[SKIP]" ? "skip" :
      response.startsWith("[REACT:") ? "react" : "text";
    log.traceEnd(trace, outcome, elapsed(trace));

    // Track group response for conversation continuation
    if (isGroup && outcome !== "skip") {
      recordGroupResponse(chatId);
    }

    // --- Update persisted conversation state based on resolved context ---
    if (resolvedCtx) {
      const resolvedState = resolvedCtx.conversationState;
      // After AI responds, if the response asks a clarification question, the next state
      // should be "awaiting_user_detail". Otherwise, persist the resolved state.
      const askingClarification = response.includes("?") && resolvedState.type === "awaiting_user_detail";
      if (askingClarification) {
        setPersistedState(chatId, "awaiting_user_detail", `AI asked clarification: ${response.substring(0, 80)}`);
      } else {
        setPersistedState(chatId, resolvedState.type, resolvedState.reason);
      }
      console.log(`[state] ${chatId}: resolved=${resolvedState.type} (${resolvedState.summary})`);
    }

    // --- Operational trace + self-check ---
    if (resolvedCtx) {
      try {
        const opTrace = buildOperationalTrace(resolvedCtx, {
          traceId: trace.traceId,
          chatId,
          contactName,
          isOwner,
          isGroup,
          userInput: body,
        });

        // Fill execution results with actual tool usage data from sendMessage
        opTrace.toolsUsed = toolsUsedInMessage;
        opTrace.responseLength = response.length;
        opTrace.aiDurationMs = aiDurationMs;
        opTrace.totalDurationMs = elapsed(trace);
        const actionClaimPattern = /שולחת בקשה|שלחתי בקשה|שולחת לרני|העברתי לרני|קבעתי|שלחתי זימון|שולחת זימון|שלחתי הודעה|שלחתי ל|העברתי ל|בדקתי את|מצאתי (מסעדה|טיסה|מלון)|הזמנתי|ביטלתי|יצרתי|נוצרה|הוספתי|מחקתי/;
        opTrace.hadHallucination = actionClaimPattern.test(response) && toolsUsedInMessage.length === 0;

        // Run self-check
        const selfCheckResult = runSelfCheck(opTrace, response, toolsUsedInMessage);
        opTrace.selfCheck = selfCheckResult;

        // Save trace
        saveOperationalTrace(opTrace);

        // Log summary
        console.log(formatTraceSummary(opTrace));

        // Log critical alerts — don't spam owner with raw ops data via WhatsApp
        if (selfCheckResult.alertLevel === "critical") {
          console.error(`[ops:critical] ${contactName}: ${selfCheckResult.summary}`);
        }
      } catch (err) {
        console.error("[ops] Operational trace error:", err);
      }
    }

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

    // Background fact + preference extraction (owner only to save API costs)
    if (isOwner) extractFacts(history).then(({ name, facts, preferences }) => {
      if (name || facts.length > 0) saveExtractedFacts(chatId, facts, name || undefined);
      if (preferences && Object.keys(preferences).length > 0) {
        for (const [category, values] of Object.entries(preferences)) {
          if (Array.isArray(values) && values.length > 0) {
            savePreference(chatId, category, values);
          }
        }
      }
    }).catch((err) => log.memorySaveError(String(err)));

    // Background followup extraction (skip for owner chats and if create_reminder tool was already used)
    try {
      if (!isOwner && !response.includes("תזכורת נוצרה")) {
        extractFollowups(response, chatId, contactName, body);
      }
    } catch (err) {
      console.error("[followup] Extraction error:", err);
    }

    // Background emotional state logging — save mood to memory when detected
    if (resolvedCtx && !isGroup) {
      const { mood } = resolvedCtx.bundle.mood;
      if (mood !== "neutral" && resolvedCtx.bundle.mood.confidence >= 0.7) {
        try {
          const contextHint = body.substring(0, 50);
          saveEmotionalState(chatId, mood, contextHint);
        } catch (err) {
          console.error("[emotional-log] Save error:", err);
        }
      }
    }

    // Background correction learning — when user corrects Limor, extract and save the lesson
    if (resolvedCtx?.bundle.turnIntent.category === "correction" && isOwner) {
      const lastAssistant = resolvedCtx.bundle.conversation.lastAssistantMessage;
      if (lastAssistant) {
        learnFromCorrection(body, lastAssistant).catch((err) =>
          console.error("[correction-learner] Error:", err)
        );
      }
    }

    // Background contact sync disabled — contacts now in SQLite
    try {
      // syncContacts();
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
