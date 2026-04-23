import dotenv from "dotenv";
import { resolve } from "path";
import { loadSoul, buildSystemPrompt } from "./soul-loader";
import { loadOwnerConfig } from "./owner-config";

// Resolve .env from project root
const envPath = resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath, override: true });

const soulName = process.env.SOUL_NAME || "limor";
const soul = loadSoul(soulName);
const systemPrompt = buildSystemPrompt(soul);
const owner = loadOwnerConfig();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  systemPrompt: process.env.SYSTEM_PROMPT || systemPrompt,
  botName: owner.assistant.name || soul.name,
  botNameEn: owner.assistant.nameEn || soul.nameEn || process.env.BOT_NAME_EN || "Limor",
  maxHistory: parseInt(process.env.MAX_HISTORY || "100", 10),
  model: soul.model.name,
  maxTokens: soul.model.maxTokens,
  owner,
  ownerChatId: owner.chatId,
  crmApiUrl: process.env.CRM_API_URL || "",
  crmUsername: process.env.CRM_USERNAME || "",
  crmPassword: process.env.CRM_PASSWORD || "",
  smtpEmail: process.env.SMTP_EMAIL || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  rapidApiKey: process.env.RAPIDAPI_KEY || "",
  ownerName: owner.name,
  ownerPhone: owner.phone,
  ownerEmail: owner.email,
  ownerGender: owner.gender,
  control4DirectorIp: process.env.CONTROL4_DIRECTOR_IP || "",
  control4Username: process.env.CONTROL4_USERNAME || "",
  control4Password: process.env.CONTROL4_PASSWORD || "",
  control4CommonName: "control4_ea3_000FFF1AE6F2",
  gettClientId: process.env.GETT_CLIENT_ID || "",
  gettClientSecret: process.env.GETT_CLIENT_SECRET || "",
  gettBusinessId: process.env.GETT_BUSINESS_ID || "",
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || "",
  healthWebhookToken: process.env.HEALTH_WEBHOOK_TOKEN || "",
  healthWebhookPort: parseInt(process.env.HEALTH_WEBHOOK_PORT || "3848", 10),
  officePcHost: process.env.OFFICE_PC_HOST || "",
  officePcUser: process.env.OFFICE_PC_USER || "",
  officePcPass: process.env.OFFICE_PC_PASS || "",
  officePcKeyPath: process.env.OFFICE_PC_KEY_PATH || "",
  icloudImapEmail: process.env.ICLOUD_IMAP_EMAIL || "",
  icloudImapPassword: process.env.ICLOUD_IMAP_PASSWORD || "",
  telegramApiId: process.env.TELEGRAM_API_ID || "",
  telegramApiHash: process.env.TELEGRAM_API_HASH || "",
  telegramPhone: process.env.TELEGRAM_PHONE || "",
};

export function validateConfig(): void {
  if (!config.anthropicApiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is required.");
    console.error("Create a .env file based on .env.example at:", envPath);
    process.exit(1);
  }
}
