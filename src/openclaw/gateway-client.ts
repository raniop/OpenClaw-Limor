/**
 * OpenClaw GatewayClient singleton — manages WebSocket connection to MyClaw.ai.
 * Handles both inbound events (WhatsApp messages) and outbound sends.
 */
import { config } from "../config";
import { randomUUID } from "crypto";

// Use require() because openclaw uses ESM exports map which doesn't resolve
// under tsconfig's "module": "commonjs" with default moduleResolution.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GatewayClient: GatewayClientClass } = require("openclaw/plugin-sdk");

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

export function initGateway(): IGatewayClient {
  if (client) return client;

  if (!config.openclawGatewayUrl) {
    throw new Error("[openclaw] OPENCLAW_GATEWAY_URL is required when OPENCLAW_ENABLED=true");
  }

  const opts: Record<string, unknown> = {
    url: config.openclawGatewayUrl,
    token: config.openclawGatewayToken || undefined,
    clientName: "external" as any,
    clientDisplayName: `${config.botNameEn}-bridge`,
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

  client = new GatewayClientClass(opts) as IGatewayClient;
  client.start();
  console.log(`[openclaw] Connecting to gateway: ${config.openclawGatewayUrl}`);
  return client;
}

/**
 * Send a text message via OpenClaw gateway → WhatsApp.
 */
export async function gatewaySendText(to: string, message: string): Promise<void> {
  const gw = getGatewayClient();
  await gw.request("send", {
    to,
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
  // For media, we use the send method with mediaUrl pointing to a data URI
  // OpenClaw's outbound system handles base64 data URIs
  const dataUri = `data:${mimetype};base64,${base64}`;
  await gw.request("send", {
    to,
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
