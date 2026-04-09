/**
 * OpenClaw GatewayClient singleton — manages WebSocket connection to MyClaw.ai.
 * Handles both inbound events (WhatsApp messages) and outbound sends.
 */
import { config } from "../config";
import { randomUUID } from "crypto";

// GatewayClient lives in openclaw's gateway-runtime ESM module.
// We use dynamic import() since the package is ESM-only.
// The path resolves through openclaw's package.json "exports" map at runtime.
let GatewayClientClass: any = null;
async function loadGatewayClient(): Promise<any> {
  if (!GatewayClientClass) {
    // Use Function to avoid TypeScript moduleResolution checking the path
    const importDynamic = new Function("specifier", "return import(specifier)");
    const mod = await importDynamic("openclaw/plugin-sdk/gateway-runtime");
    GatewayClientClass = mod.GatewayClient;
  }
  return GatewayClientClass;
}

// Type definitions (from openclaw/dist/plugin-sdk/src/gateway/client.d.ts)
interface GatewayClientOptions {
  url?: string;
  token?: string;
  clientName?: string;
  clientDisplayName?: string;
  onEvent?: (evt: { type: string; event: string; payload?: unknown; seq?: number }) => void;
  onHelloOk?: (hello: unknown) => void;
  onConnectError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
}

interface IGatewayClient {
  start(): void;
  stop(): void;
  stopAndWait(opts?: { timeoutMs?: number }): Promise<void>;
  request<T = Record<string, unknown>>(method: string, params?: unknown, opts?: { expectFinal?: boolean; timeoutMs?: number | null }): Promise<T>;
}

let client: IGatewayClient | null = null;
let eventHandler: ((evt: { type: string; event: string; payload?: unknown }) => void) | null = null;

export function setEventHandler(handler: (evt: { type: string; event: string; payload?: unknown }) => void): void {
  eventHandler = handler;
}

export function getGatewayClient(): IGatewayClient {
  if (!client) {
    throw new Error("[openclaw] GatewayClient not initialized — call initGateway() first");
  }
  return client;
}

export async function initGateway(): Promise<IGatewayClient> {
  if (client) return client;

  if (!config.openclawGatewayUrl) {
    throw new Error("[openclaw] OPENCLAW_GATEWAY_URL is required when OPENCLAW_ENABLED=true");
  }

  const Cls = await loadGatewayClient();

  const opts: Record<string, unknown> = {
    url: config.openclawGatewayUrl,
    token: config.openclawGatewayToken || undefined,
    clientName: "gateway-client",
    clientDisplayName: `${config.botNameEn}-bridge`,
    mode: "backend",
    onEvent: (evt: { type: string; event: string; payload?: unknown }) => {
      if (eventHandler) {
        eventHandler(evt);
      }
    },
    onHelloOk: () => {
      console.log("[openclaw] Gateway connected successfully");
    },
    onConnectError: (err: Error) => {
      console.error("[openclaw] Gateway connection error:", err.message);
    },
    onClose: (code: number, reason: string) => {
      console.warn(`[openclaw] Gateway closed: code=${code} reason=${reason}`);
      // GatewayClient has built-in reconnection with backoff
    },
  };

  client = new Cls(opts) as IGatewayClient;
  client.start();
  console.log(`[openclaw] Connecting to gateway: ${config.openclawGatewayUrl}`);
  return client;
}

/**
 * Convert Limor's internal chat IDs to MyClaw/Baileys JID format for sending.
 * Limor uses "18537179529435@lid" (whatsapp-web.js LID) but MyClaw needs "972524444244@s.whatsapp.net".
 */
function toSendableJid(chatId: string): string {
  // If it's the owner's LID, convert to phone-based JID
  if (chatId === config.ownerChatId) {
    const phone = config.ownerPhone?.replace(/^0/, "972").replace(/^\+/, "") || "";
    if (phone) return `${phone}@s.whatsapp.net`;
  }
  // Already a standard JID
  if (chatId.includes("@s.whatsapp.net") || chatId.includes("@g.us")) return chatId;
  // LID format — try to extract and convert (best effort)
  if (chatId.includes("@lid")) {
    // Can't convert unknown LIDs; return as-is and hope MyClaw handles it
    return chatId;
  }
  // Plain phone number
  const phone = chatId.replace(/^\+/, "").replace(/\D/g, "");
  if (phone) return `${phone}@s.whatsapp.net`;
  return chatId;
}

/**
 * Send a text message via OpenClaw gateway → WhatsApp.
 */
export async function gatewaySendText(to: string, message: string): Promise<void> {
  const gw = getGatewayClient();
  const jid = toSendableJid(to);
  await gw.request("send", {
    to: jid,
    message,
    channel: "whatsapp",
    accountId: config.openclawWhatsAppAccountId || undefined,
    idempotencyKey: randomUUID(),
  });
}

/**
 * Send a media file via OpenClaw gateway → WhatsApp.
 */
export async function gatewaySendMedia(
  to: string,
  base64: string,
  filename: string,
  mimetype: string,
  caption?: string,
): Promise<void> {
  const gw = getGatewayClient();
  const jid = toSendableJid(to);
  // For media, we use the send method with mediaUrl pointing to a data URI
  // OpenClaw's outbound system handles base64 data URIs
  const dataUri = `data:${mimetype};base64,${base64}`;
  await gw.request("send", {
    to: jid,
    message: caption || "",
    mediaUrl: dataUri,
    channel: "whatsapp",
    accountId: config.openclawWhatsAppAccountId || undefined,
    idempotencyKey: randomUUID(),
  });
}

/**
 * Gracefully stop the gateway connection.
 */
export async function stopGateway(): Promise<void> {
  if (client) {
    await client.stopAndWait({ timeoutMs: 5000 }).catch(() => {});
    client = null;
    console.log("[openclaw] Gateway stopped");
  }
}
