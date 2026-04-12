/**
 * Message send queue — enforces delays between WhatsApp sends to avoid bot detection.
 * Per-chat queuing with random jitter and burst protection.
 */
import type { Client, MessageMedia, MessageSendOptions } from "whatsapp-web.js";

const PER_CHAT_DELAY_MIN = 800;
const PER_CHAT_DELAY_MAX = 1500;
const GLOBAL_MIN_DELAY = 300;
const BURST_THRESHOLD = 3;
const BURST_COOLDOWN = 3000;

let lastGlobalSend = 0;
let recentSendCount = 0;
let recentSendWindowStart = 0;
const BURST_WINDOW = 5000; // 5s window for burst detection

type QueueItem = {
  chatId: string;
  content: string | MessageMedia;
  options?: MessageSendOptions;
  resolve: (val: any) => void;
  reject: (err: any) => void;
};

const chatQueues = new Map<string, QueueItem[]>();
const processingChats = new Set<string>();

let clientRef: Client | null = null;

export function initSendQueue(client: Client): void {
  clientRef = client;
}

function randomDelay(): number {
  return PER_CHAT_DELAY_MIN + Math.random() * (PER_CHAT_DELAY_MAX - PER_CHAT_DELAY_MIN);
}

function trackBurst(): number {
  const now = Date.now();
  if (now - recentSendWindowStart > BURST_WINDOW) {
    recentSendCount = 0;
    recentSendWindowStart = now;
  }
  recentSendCount++;
  if (recentSendCount >= BURST_THRESHOLD) {
    recentSendCount = 0;
    recentSendWindowStart = now;
    return BURST_COOLDOWN;
  }
  return 0;
}

async function processQueue(chatId: string): Promise<void> {
  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);

  const queue = chatQueues.get(chatId);
  while (queue && queue.length > 0) {
    const item = queue.shift()!;

    // Enforce global minimum delay
    const sinceLastGlobal = Date.now() - lastGlobalSend;
    if (sinceLastGlobal < GLOBAL_MIN_DELAY) {
      await sleep(GLOBAL_MIN_DELAY - sinceLastGlobal);
    }

    // Burst protection
    const burstDelay = trackBurst();
    if (burstDelay > 0) {
      console.log(`[send-queue] Burst cooldown: ${burstDelay}ms`);
      await sleep(burstDelay);
    }

    try {
      lastGlobalSend = Date.now();
      const result = await clientRef!.sendMessage(item.chatId, item.content, item.options);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }

    // Per-chat delay before next message
    if (queue.length > 0) {
      await sleep(randomDelay());
    }
  }

  processingChats.delete(chatId);
  chatQueues.delete(chatId);
}

export function queuedSendMessage(
  chatId: string,
  content: string | MessageMedia,
  options?: MessageSendOptions,
): Promise<any> {
  if (!clientRef) {
    return Promise.reject(new Error("[send-queue] Client not initialized"));
  }

  return new Promise((resolve, reject) => {
    if (!chatQueues.has(chatId)) {
      chatQueues.set(chatId, []);
    }
    chatQueues.get(chatId)!.push({ chatId, content, options, resolve, reject });
    processQueue(chatId);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
