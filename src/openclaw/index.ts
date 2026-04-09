/**
 * OpenClaw transport orchestrator — replaces whatsapp-web.js with OpenClaw gateway.
 *
 * When OPENCLAW_ENABLED=true, this module:
 * 1. Connects to MyClaw.ai gateway via WebSocket
 * 2. Listens for inbound WhatsApp messages (gateway events)
 * 3. Converts them to virtual Message objects
 * 4. Routes them through the existing handleMessage() pipeline
 * 5. Sets send callbacks to route outbound messages through the gateway
 */
import { config } from "../config";
import { log } from "../logger";
import { conversationStore } from "../stores";
import { setNotifyOwnerCallback, setSendMessageCallback, setSendFileCallback } from "../ai";
import { handleMessage } from "../whatsapp";
import { withChatLock } from "../whatsapp/chat-lock";
import { initGateway, setEventHandler, gatewaySendText, gatewaySendMedia, stopGateway, getGatewayClient } from "./gateway-client";
import { createVirtualMessage } from "./message-adapter";
import type { OpenClawInboundMessage } from "./message-adapter";
import { startDeliveryPoller, startSmsWatcher } from "../sms";
import { startEmailPoller } from "../email/email-poller";
import { startAlertPoller } from "../telegram/alert-poller";
import { startProactiveScheduler } from "../proactive";
import { statePath } from "../state-dir";
import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * Initialize OpenClaw as the WhatsApp transport layer.
 * This replaces createWhatsAppClient() + client.initialize().
 */
export async function createOpenClawClient(): Promise<void> {
  console.log("[openclaw] Starting OpenClaw transport...");

  // 1. Initialize gateway connection
  await initGateway();

  // 2. Set up inbound message handler (events + polling)
  setEventHandler((evt) => {
    const eventName = evt.event;
    const payload = evt.payload as Record<string, unknown> | undefined;

    if (!payload) return;

    // Match known inbound message event patterns
    if (
      eventName === "message.received" ||
      eventName === "channel.message" ||
      eventName === "inbound.message" ||
      eventName === "chat.message" ||
      eventName === "limor.inbound"
    ) {
      handleInboundMessage(payload).catch((err) =>
        console.error("[openclaw] Error handling inbound message:", err)
      );
    } else if (eventName === "session.updated" || eventName === "channels.status" || eventName === "tick" || eventName === "health") {
      // Known non-message events — ignore silently
    } else {
      // Log unknown events during initial integration
      console.log(`[openclaw] Event: ${eventName}`, JSON.stringify(payload).slice(0, 200));
    }
  });

  // 2b. Poll limor.poll gateway method for messages queued by the MyClaw plugin
  startMessagePoller();

  // 3. Set up send callbacks (same interface as whatsapp-web.js module)
  log.systemReady();

  setNotifyOwnerCallback(async (message: string) => {
    if (config.ownerChatId) {
      await gatewaySendText(config.ownerChatId, message);
      conversationStore.addMessage(config.ownerChatId, "assistant", message);
    }
  });

  setSendMessageCallback(async (chatId: string, message: string) => {
    await gatewaySendText(chatId, message);
    conversationStore.addMessage(chatId, "assistant", message);
  });

  setSendFileCallback(async (chatId: string, base64: string, filename: string, mimetype: string, caption?: string) => {
    await gatewaySendMedia(chatId, base64, filename, mimetype, caption);
    conversationStore.addMessage(chatId, "assistant", caption || `📎 ${filename}`);
  });

  // 4. Start pollers (same as whatsapp/index.ts "ready" handler)
  try {
    startDeliveryPoller(async (text: string) => {
      if (config.ownerChatId) {
        await gatewaySendText(config.ownerChatId, text);
      }
    });
  } catch (err: any) {
    console.error("[sms] Failed to start delivery poller:", err.message);
  }

  try {
    startSmsWatcher(async (text: string) => {
      if (config.ownerChatId) {
        await gatewaySendText(config.ownerChatId, text);
        conversationStore.addMessage(config.ownerChatId, "assistant", text);
      }
    });
  } catch (err: any) {
    console.error("[sms-watcher] Failed to start SMS watcher:", err.message);
  }

  try {
    startEmailPoller(async (text: string) => {
      if (config.ownerChatId) {
        await gatewaySendText(config.ownerChatId, text);
        conversationStore.addMessage(config.ownerChatId, "assistant", text);
      }
    });
  } catch (err: any) {
    console.error("[email] Failed to start email poller:", err.message);
  }

  try {
    startAlertPoller(
      async (text: string) => {
        if (config.ownerChatId) {
          await gatewaySendText(config.ownerChatId, text);
        }
      },
      async (imageUrl: string, caption: string) => {
        if (config.ownerChatId) {
          try {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
            const buffer = Buffer.from(await imageResponse.arrayBuffer());
            const base64 = buffer.toString("base64");
            const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
            await gatewaySendMedia(config.ownerChatId, base64, "telegram-image.jpg", contentType, caption);
          } catch (imgErr) {
            await gatewaySendText(config.ownerChatId, caption);
          }
        }
      }
    );
  } catch (err: any) {
    console.error("[telegram] Failed to start alert poller:", err.message);
  }

  try {
    startProactiveScheduler();
  } catch (err: any) {
    console.error("[proactive] Failed to start scheduler:", err.message);
  }

  // 5. Start notification poller (dashboard → WhatsApp)
  startNotificationPoller();

  console.log("[openclaw] Transport ready — listening for WhatsApp messages via MyClaw gateway");
}

/**
 * Dedup: track recent message IDs to prevent double-processing
 * (messages arrive via both gateway events and limor.poll)
 */
const recentMessageIds = new Set<string>();

/**
 * Handle an inbound message event from the OpenClaw gateway.
 */
async function handleInboundMessage(payload: Record<string, unknown>): Promise<void> {
  // Dedup by messageId or content+timestamp
  const dedupKey = (payload.messageId as string) || `${payload.from}:${payload.content}:${payload.timestamp}`;
  if (recentMessageIds.has(dedupKey)) return;
  recentMessageIds.add(dedupKey);
  setTimeout(() => recentMessageIds.delete(dedupKey), 30000); // Clean after 30s

  // Map sender JID to owner chat ID if it matches owner's phone
  // MyClaw/Baileys uses "972524444244@s.whatsapp.net" but Limor expects "18537179529435@lid"
  const rawFrom = (payload.from as string) || (payload.senderId as string) || "";
  // Strip leading 0 or + from owner phone for matching (0524444244 → 524444244)
  const ownerPhone = config.ownerPhone?.replace(/^[\+0]+/, "") || "";
  const normalizedFrom = ownerPhone && rawFrom.includes(ownerPhone)
    ? config.ownerChatId  // Map to the owner chat ID Limor expects
    : rawFrom;

  // Map payload to our canonical inbound type
  const inbound: OpenClawInboundMessage = {
    from: normalizedFrom,
    to: payload.to as string | undefined,
    content: (payload.content as string) || (payload.body as string) || (payload.message as string) || "",
    body: payload.body as string | undefined,
    timestamp: payload.timestamp as number | undefined,
    channelId: (payload.channelId as string) || "whatsapp",
    accountId: payload.accountId as string | undefined,
    conversationId: payload.conversationId as string | undefined,
    messageId: payload.messageId as string | undefined,
    senderId: payload.senderId as string | undefined,
    senderName: (payload.senderName as string) || (payload.pushName as string) || undefined,
    senderE164: payload.senderE164 as string | undefined,
    isGroup: !!(payload.isGroup || payload.groupId),
    groupId: payload.groupId as string | undefined,
    threadId: payload.threadId as string | number | undefined,
    mediaPath: payload.mediaPath as string | undefined,
    mediaType: payload.mediaType as string | undefined,
    mediaPaths: payload.mediaPaths as string[] | undefined,
    mediaTypes: payload.mediaTypes as string[] | undefined,
    quotedMessageBody: payload.quotedMessageBody as string | undefined,
    quotedMessageFrom: payload.quotedMessageFrom as string | undefined,
    quotedMessageFromMe: payload.quotedMessageFromMe as boolean | undefined,
    vCards: payload.vCards as string[] | undefined,
  };

  if (!inbound.from || !inbound.content) {
    console.log("[openclaw] Skipping empty inbound message:", JSON.stringify(payload).slice(0, 200));
    return;
  }

  // Create virtual message and route through existing pipeline
  const virtualMsg = createVirtualMessage(inbound);

  // Emit agent event bus (same as whatsapp/index.ts)
  try {
    const { agentEventBus } = require("../agents/autonomous");
    agentEventBus.emitTyped("message:received", {
      chatId: virtualMsg.from,
      isGroup: inbound.isGroup,
      senderName: virtualMsg.author || virtualMsg.from,
      timestamp: Date.now(),
    });
  } catch {}

  // Process through handleMessage with chat lock
  await withChatLock(virtualMsg.from, () => handleMessage(virtualMsg as any));
}

/**
 * Poll for pending notifications from the dashboard.
 */
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
          gatewaySendText(n.chatId, n.message).catch((err) =>
            console.error(`[notify] Failed to send to ${n.chatId}:`, err.message)
          );
          console.log(`[notify] Sent completion notification to ${n.chatId}`);
        }
      }

      writeFileSync(notifyPath, "[]", "utf-8");
    } catch {}
  }, 5000);

  console.log("[notify] Notification poller started (OpenClaw)");
}

/**
 * Poll the MyClaw gateway for queued WhatsApp messages.
 * The limor-relay plugin on MyClaw intercepts messages and queues them.
 * We poll every 2 seconds to fetch and process them.
 */
let pollerInterval: ReturnType<typeof setInterval> | null = null;

function startMessagePoller(): void {
  let polling = false;

  pollerInterval = setInterval(async () => {
    if (polling) return; // Skip if previous poll is still running
    polling = true;

    try {
      const gw = getGatewayClient();
      const result = await gw.request<{ messages: Array<Record<string, unknown>>; count: number }>(
        "limor.poll",
        {},
        { timeoutMs: 5000 },
      );

      if (result.count > 0) {
        console.log(`[openclaw] Polled ${result.count} message(s) from MyClaw`);
        for (const msg of result.messages) {
          handleInboundMessage(msg).catch((err: any) =>
            console.error("[openclaw] Error handling polled message:", err.message)
          );
        }
      }
    } catch (err: any) {
      // Silently ignore poll errors (gateway not connected yet, etc.)
      if (!err.message?.includes("not connected") && !err.message?.includes("timeout")) {
        console.error("[openclaw] Poll error:", err.message);
      }
    } finally {
      polling = false;
    }
  }, 2000); // Poll every 2 seconds

  console.log("[openclaw] Message poller started (every 2s)");
}

/**
 * Graceful shutdown.
 */
export async function shutdownOpenClaw(): Promise<void> {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
  console.log("[openclaw] Shutting down...");
  log.systemShutdown();
  await stopGateway();
  console.log("[openclaw] Shutdown complete");
}
