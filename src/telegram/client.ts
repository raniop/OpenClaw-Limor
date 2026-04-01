/**
 * Telegram client using gramjs (MTProto).
 * Connects as a regular user account to read group/channel messages.
 * Session is persisted to file for reconnection without re-auth.
 */
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { config } from "../config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const SESSION_PATH = resolve(__dirname, "../../workspace/state/telegram-session.txt");

let client: TelegramClient | null = null;

function loadSession(): string {
  if (existsSync(SESSION_PATH)) {
    return readFileSync(SESSION_PATH, "utf-8").trim();
  }
  return "";
}

function saveSession(session: string): void {
  writeFileSync(SESSION_PATH, session, "utf-8");
}

export async function initTelegramClient(): Promise<void> {
  if (!config.telegramApiId || !config.telegramApiHash) {
    console.log("[telegram] No API credentials configured, skipping init");
    return;
  }

  const apiId = parseInt(config.telegramApiId, 10);
  const apiHash = config.telegramApiHash;
  const sessionStr = loadSession();
  const session = new StringSession(sessionStr);

  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  });

  if (sessionStr) {
    // Reconnect with saved session
    await client.connect();
    console.log("[telegram] Connected with saved session");
  } else {
    // First-time auth — needs interactive input
    const input = await import("input");
    await client.start({
      phoneNumber: async () => config.telegramPhone || await input.default.text("Phone number: "),
      password: async () => await input.default.text("2FA password (or press enter): "),
      phoneCode: async () => await input.default.text("Telegram code: "),
      onError: (err) => console.error("[telegram] Auth error:", err),
    });
    // Save session for future use
    const savedSession = client.session.save() as unknown as string;
    saveSession(savedSession);
    console.log("[telegram] Authenticated and session saved");
  }
}

export function isConnected(): boolean {
  return client?.connected ?? false;
}

export async function getTelegramGroupMessages(
  groupName: string,
  hours: number = 24,
  limit: number = 200,
): Promise<string[]> {
  if (!client?.connected) {
    throw new Error("Telegram client not connected");
  }

  // Find the group/channel by name
  const result = await client.invoke(
    new Api.contacts.Search({ q: groupName, limit: 10 })
  );

  const chat = result.chats.find((c: any) =>
    c.title?.toLowerCase().includes(groupName.toLowerCase())
  );

  if (!chat) {
    throw new Error(`Group "${groupName}" not found`);
  }

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const messages: string[] = [];

  for await (const msg of client.iterMessages(chat, { limit })) {
    if (msg.date && new Date(msg.date * 1000) < cutoff) break;
    if (msg.message) {
      const sender = msg.sender && "firstName" in msg.sender
        ? `${msg.sender.firstName || ""} ${msg.sender.lastName || ""}`.trim()
        : "???";
      const time = new Date(msg.date * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      messages.push(`[${time}] ${sender}: ${msg.message}`);
    }
  }

  return messages.reverse();
}

export async function listTelegramGroups(): Promise<Array<{ title: string; id: string; type: string }>> {
  if (!client?.connected) {
    throw new Error("Telegram client not connected");
  }

  const dialogs = await client.getDialogs({ limit: 100 });
  const groups: Array<{ title: string; id: string; type: string }> = [];

  for (const d of dialogs) {
    if (d.isGroup || d.isChannel) {
      groups.push({
        title: d.title || "???",
        id: String(d.id),
        type: d.isChannel ? "channel" : "group",
      });
    }
  }

  return groups;
}

export async function disconnectTelegram(): Promise<void> {
  if (client?.connected) {
    await client.disconnect();
    console.log("[telegram] Disconnected");
  }
}
