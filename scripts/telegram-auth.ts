/**
 * One-time Telegram authentication script.
 * Run: npx tsx scripts/telegram-auth.ts
 * It will connect, send you a code on Telegram, and wait for you to type it.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { writeFileSync } from "fs";
import { resolve } from "path";
import input from "input";

const API_ID = 32166704;
const API_HASH = "0f5e1e0ada203bb0146fd607c73badeb";
const PHONE = "+972524444244";
const SESSION_PATH = resolve(__dirname, "../workspace/state/telegram-session.txt");

async function main() {
  const session = new StringSession("");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });

  console.log("Connecting to Telegram...");

  await client.start({
    phoneNumber: async () => PHONE,
    password: async () => await input.text("2FA password (or press enter): "),
    phoneCode: async () => await input.text("Enter Telegram code: "),
    onError: (err) => console.error("Error:", err),
  });

  const savedSession = client.session.save() as unknown as string;
  writeFileSync(SESSION_PATH, savedSession, "utf-8");
  console.log("Session saved to", SESSION_PATH);
  console.log("You can now restart Limor — she will connect automatically.");
  await client.disconnect();
  process.exit(0);
}

main().catch(console.error);
