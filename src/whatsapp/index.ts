/**
 * WhatsApp client setup and message routing.
 * Uses Baileys (WebSocket) instead of Puppeteer/Chrome.
 * Sub-modules handle media, owner commands, approval gating, and response dispatch.
 */
import { resolve } from "path";
import {
  connectBaileys,
  sendTextMessage,
  sendMediaMessage,
  sendImageFromUrl,
  isSocketConnected,
  getBotJid,
  getSocket,
  toLegacyJid,
  toBaileysJid,
} from "./baileys-client";
import type { BaileysMessage } from "./baileys-client";
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
import { startEmailPoller } from "../email/email-poller";
import { startAlertPoller } from "../telegram/alert-poller";
import { statePath } from "../state-dir";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { addManualContact } from "../contacts";
import { trackGroupPerson, getGroupPeopleContext } from "../conversation";
import { syncContacts } from "../sync-contacts";

let connected = false;
let limorWhatsAppId: string = "";

export function getClient(): any {
  return isSocketConnected() ? getSocket() : null;
}

async function sendToChat(chatId: string, text: string): Promise<void> {
  if (isSocketConnected()) {
    await sendTextMessage(chatId, text);
  }
}

export function createWhatsAppClient(): { initialize: () => Promise<void>; destroy: () => Promise<void> } {
  // Return a mock client interface that matches what src/index.ts expects
  return {
    initialize: async () => {
      await connectBaileys({
        onReady: () => {
          connected = true;
          limorWhatsAppId = toLegacyJid(getBotJid());
          console.log(`[whatsapp] Bot ID: ${limorWhatsAppId}`);
          log.systemReady();

          // Set up callbacks for AI system
          setNotifyOwnerCallback(async (message: string) => {
            if (config.ownerChatId && isSocketConnected()) {
              await sendTextMessage(config.ownerChatId, message);
              conversationStore.addMessage(config.ownerChatId, "assistant", message);
            }
          });

          setSendMessageCallback(async (chatId: string, message: string) => {
            if (isSocketConnected()) {
              await sendTextMessage(chatId, message);
              conversationStore.addMessage(chatId, "assistant", message);
            }
          });

          setSendFileCallback(async (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => {
            if (isSocketConnected()) {
              await sendMediaMessage(chatId, base64, filename, mimetype, caption);
              conversationStore.addMessage(chatId, "assistant", caption || `📎 ${filename}`);
            }
          });

          // ─── Gradual startup ─────────────────────────────────────────
          const STARTUP_DELAY_MS = 3 * 60 * 1000;
          const UNREAD_DELAY_MS = 2 * 60 * 1000;

          console.log("[startup] Connected! Delaying automated services to avoid detection...");

          // Notification poller (safe — low volume)
          startNotificationPoller();

          // Start all external pollers AFTER startup delay
          setTimeout(() => {
            console.log("[startup] Starting external pollers...");

            try {
              startDeliveryPoller(async (text: string) => {
                if (config.ownerChatId && isSocketConnected()) {
                  await sendTextMessage(config.ownerChatId, text);
                }
              });
            } catch (err) {
              console.error("[sms] Failed to start delivery poller:", err);
            }

            try {
              startSmsWatcher(async (text: string) => {
                if (config.ownerChatId && isSocketConnected()) {
                  await sendTextMessage(config.ownerChatId, text);
                  conversationStore.addMessage(config.ownerChatId, "assistant", text);
                }
              });
            } catch (err) {
              console.error("[sms-watcher] Failed to start SMS watcher:", err);
            }

            try {
              startEmailPoller(async (text: string) => {
                if (config.ownerChatId && isSocketConnected()) {
                  await sendTextMessage(config.ownerChatId, text);
                  conversationStore.addMessage(config.ownerChatId, "assistant", text);
                }
              });
            } catch (err) {
              console.error("[email] Failed to start email poller:", err);
            }

            try {
              startAlertPoller(
                async (text: string) => {
                  if (config.ownerChatId && isSocketConnected()) {
                    await sendTextMessage(config.ownerChatId, text);
                  }
                },
                async (imageUrl: string, caption: string) => {
                  if (config.ownerChatId && isSocketConnected()) {
                    await sendImageFromUrl(config.ownerChatId, imageUrl, caption);
                  }
                }
              );
            } catch (err) {
              console.error("[telegram] Failed to start alert poller:", err);
            }

            try {
              startProactiveScheduler();
            } catch (err) {
              console.error("[proactive] Failed to start scheduler:", err);
            }

            console.log("[startup] All services started.");
          }, STARTUP_DELAY_MS);
        },

        onMessage: (msg: BaileysMessage) => {
          const chatId = msg.from;
          // Emit event for autonomous agents
          try {
            const { agentEventBus } = require("../agents/autonomous");
            agentEventBus.emitTyped("message:received", {
              chatId,
              isGroup: chatId.includes("@g.us"),
              senderName: msg.author || chatId,
              timestamp: Date.now(),
            });
          } catch {}
          withChatLock(chatId, () => handleMessage(msg));
        },

        onDisconnected: (reason: string) => {
          connected = false;
          console.error(`[whatsapp] Disconnected: ${reason}`);
        },
      });
    },

    destroy: async () => {
      // Baileys cleanup is handled internally
      connected = false;
    },
  };
}

// ─── Notification Poller ──────────────────────────────────────────────

function startNotificationPoller(): void {
  const notifyPath = statePath("pending-notifications.json");

  setInterval(() => {
    try {
      if (!existsSync(notifyPath)) return;
      const content = readFileSync(notifyPath, "utf-8").trim();
      if (!content || content === "[]") return;

      const notifications = JSON.parse(content);
      if (!Array.isArray(notifications) || notifications.length === 0) return;

      for (const n of notifications) {
        if (n.chatId && n.message) {
          sendTextMessage(n.chatId, n.message).catch((err: any) =>
            console.error(`[notify] Failed to send to ${n.chatId}:`, err.message)
          );
          console.log(`[notify] Sent completion notification to ${n.chatId}`);
        }
      }

      writeFileSync(notifyPath, "[]", "utf-8");
    } catch {}
  }, 5000);

  console.log("[notify] Notification poller started");
}

// ─── Message Handler ──────────────────────────────────────────────────

async function handleMessage(msg: BaileysMessage): Promise<void> {
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
  if (isOwnerVcard && msg.type === "vcard" && msg.vCards?.length > 0) {
    const vcards: string[] = msg.vCards;
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
  let quotedSenderName = "";
  let quotedMsgFromMe = false;
  if (msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      quotedMsgFromMe = !!quotedMsg.fromMe;
      const quotedText = quotedMsg.body || "(מדיה)";
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

  // In groups, track the individual sender
  if (isGroup && msg.author) {
    try {
      const authorContact = await msg.getContact();
      const authorPhone = authorContact.number || msg.author.replace(/@.*$/, "");
      const authorName = authorContact.pushname || authorContact.name || authorPhone;
      updateContact(msg.author, authorName, authorPhone);
    } catch {}
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
      const messageForHistory = `[${contactName}]: ${body}`;
      conversationStore.addMessage(chatId, "user", messageForHistory);
      try { trackGroupPerson(chatId, contactName, body); } catch {}
      log.traceEnd(trace, "muted_group", elapsed(trace));
      return;
    }

    // --- Group pre-filter ---
    if (isGroup) {
      const mentionsLimor = new RegExp(`(^|\\s)${config.botName}($|\\s|[?.!,])`, "i").test(body) || new RegExp(`\\b${config.botNameEn}\\b`, "i").test(body);
      const inOtherThread = isPartOfOtherThread(chatId, contactName);
      const mentionedIds: string[] = msg.mentionedIds || [];

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
        const messageForHistory = `[${contactName}]: ${body}`;
        conversationStore.addMessage(chatId, "user", messageForHistory);
        try { trackGroupPerson(chatId, contactName, body); } catch {}
        console.log(`[group-filter] SKIP: ${filterResult.reason} | ${contactName} in ${chat.name}`);
        log.traceEnd(trace, "group_filtered", elapsed(trace));
        return;
      }
      (trace as any)._groupFilter = filterResult;
      if (filterResult.verdict === "let_ai_decide") {
        (trace as any)._delayTyping = true;
      }
    }

    // --- Owner commands ---
    if (!isGroup && config.ownerChatId && chatId === config.ownerChatId) {
      const handled = await handleOwnerCommand({
        chatId, body,
        reply: (text) => msg.reply(text),
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
        reply: (text) => msg.reply(text),
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
    try { await chat.sendSeen(); } catch {}
    const messageForHistory = isGroup ? `[${contactName}]: ${body}` : body;
    conversationStore.addMessage(chatId, "user", messageForHistory);
    if (!(trace as any)._delayTyping) {
      try { await chat.sendStateTyping(); } catch {}
    }

    if (isGroup) {
      try { trackGroupPerson(chatId, contactName, body); } catch {}
    }

    const memoryContext = getMemoryContext(chatId);
    const conversationSummary = conversationStore.getSummary(chatId);
    const fullHistory = conversationStore.getHistory(chatId);
    const sender = { chatId, name: contactName, isOwner };

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

    if (conversationSummary) {
      extraContext += `\n\n⚠️ שים לב: יש היסטוריה ישנה שלא נראית בשיחה הנוכחית. סיכום: ${conversationSummary}`;
    }

    try {
      const topicContext = getRelevantTopicSegments(chatId, body);
      if (topicContext) extraContext += "\n\n" + topicContext;
    } catch {}

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
      try {
        const groupPeopleCtx = getGroupPeopleContext(chatId);
        if (groupPeopleCtx) extraContext += "\n\n" + groupPeopleCtx;
      } catch {}

      const filterResult = (trace as any)._groupFilter as { verdict: string; reason: string } | undefined;
      const recentlyResponded = hasRecentGroupResponse(chatId);

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

    const modelRouting = resolvedCtx ? {
      isOwner,
      isGroup,
      turnIntent: resolvedCtx.bundle.turnIntent.category,
      toolIntentType: resolvedCtx.toolIntent.type,
    } : undefined;

    if (resolvedCtx) {
      try { saveContextSnapshot(chatId, resolvedCtx.debugTrace.summary); } catch {}
    }

    log.aiRequestStart(trace);
    const aiTimer = startTimer();
    const sendResult = await sendMessage(history, (memoryContext || "") + extraContext, sender, { allowTools, allowedToolNames, modelRouting });
    const response = sendResult.text;
    const toolsUsedInMessage = sendResult.toolsUsed;
    const toolsSucceededInMessage = sendResult.toolsSucceeded || [];
    const toolsFailedInMessage = sendResult.toolsFailed || [];
    const aiDurationMs = aiTimer.stop();
    log.aiRequestEnd(aiDurationMs, toolsUsedInMessage.length, trace);

    if ((trace as any)._delayTyping && !response.trim().startsWith("[SKIP]")) {
      try { await chat.sendStateTyping(); } catch {}
    }

    const responseTimer = startTimer();
    await handleResponse(chatId, contactName, response,
      (text) => msg.reply(text),
      (emoji) => msg.react(emoji),
      trace,
      {
        isVoice: isVoiceMessage,
        sendVoice: isVoiceMessage && isSocketConnected() ? async (base64: string, mimetype: string) => {
          await sendMediaMessage(chatId, base64, "voice.mp3", mimetype);
        } : undefined,
      }
    );
    const responseDurationMs = responseTimer.stop();

    const outcome = response.trim() === "[SKIP]" ? "skip" :
      response.startsWith("[REACT:") ? "react" : "text";
    log.traceEnd(trace, outcome, elapsed(trace));

    if (isGroup && outcome !== "skip") {
      recordGroupResponse(chatId);
    }

    // --- Persisted conversation state ---
    if (resolvedCtx) {
      const resolvedState = resolvedCtx.conversationState;
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

        opTrace.toolsUsed = toolsUsedInMessage;
        opTrace.toolsSucceeded = toolsSucceededInMessage;
        opTrace.toolsFailed = toolsFailedInMessage;
        opTrace.responseLength = response.length;
        opTrace.aiDurationMs = aiDurationMs;
        opTrace.totalDurationMs = elapsed(trace);
        const actionClaimPattern = /שולחת בקשה|שלחתי בקשה|שולחת לרני|העברתי לרני|קבעתי|שלחתי זימון|שולחת זימון|שלחתי הודעה|שלחתי ל|העברתי ל|בדקתי את|מצאתי (מסעדה|טיסה|מלון)|הזמנתי|ביטלתי|יצרתי|נוצרה|הוספתי|מחקתי/;
        opTrace.hadHallucination = actionClaimPattern.test(response) && toolsUsedInMessage.length === 0;

        const selfCheckResult = runSelfCheck(opTrace, response, toolsUsedInMessage);
        opTrace.selfCheck = selfCheckResult;
        saveOperationalTrace(opTrace);
        console.log(formatTraceSummary(opTrace));

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

    // Background fact + preference extraction (owner only)
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

    // Background followup extraction
    try {
      if (!isOwner && !response.includes("תזכורת נוצרה")) {
        extractFollowups(response, chatId, contactName, body);
      }
    } catch (err) {
      console.error("[followup] Extraction error:", err);
    }

    // Background emotional state logging
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

    // Background correction learning
    if (resolvedCtx?.bundle.turnIntent.category === "correction" && isOwner) {
      const lastAssistant = resolvedCtx.bundle.conversation.lastAssistantMessage;
      if (lastAssistant) {
        learnFromCorrection(body, lastAssistant).catch((err) =>
          console.error("[correction-learner] Error:", err)
        );
      }
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
    const waidMatch = vcard.match(/waid=(\d+)/i);
    const telMatch = vcard.match(/TEL[^:]*:([^\n]+)/i);
    const name = fnMatch?.[1]?.trim();
    const phone = waidMatch?.[1] || telMatch?.[1]?.replace(/\D/g, "");
    if (name && phone && phone.length >= 10) return { name, phone };
  } catch {}
  return null;
}
