import dotenv from "dotenv";
import { resolve } from "path";
import { loadSoul, buildSystemPrompt } from "./soul-loader";

// Resolve .env from project root
const envPath = resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath, override: true });

const soulName = process.env.SOUL_NAME || "limor";
const soul = loadSoul(soulName);
const systemPrompt = buildSystemPrompt(soul);

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  systemPrompt: process.env.SYSTEM_PROMPT || systemPrompt,
  botName: soul.name,
  maxHistory: parseInt(process.env.MAX_HISTORY || "100", 10),
  model: soul.model.name,
  maxTokens: soul.model.maxTokens,
  ownerChatId: process.env.OWNER_CHAT_ID || "",
  crmApiUrl: process.env.CRM_API_URL || "",
  crmUsername: process.env.CRM_USERNAME || "",
  crmPassword: process.env.CRM_PASSWORD || "",
  smtpEmail: process.env.SMTP_EMAIL || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  rapidApiKey: process.env.RAPIDAPI_KEY || "",
  ownerName: process.env.OWNER_NAME || "",
  ownerPhone: process.env.OWNER_PHONE || "",
  ownerEmail: process.env.OWNER_EMAIL || "",
  control4DirectorIp: process.env.CONTROL4_DIRECTOR_IP || "",
  control4Username: process.env.CONTROL4_USERNAME || "",
  control4Password: process.env.CONTROL4_PASSWORD || "",
  control4CommonName: "control4_ea3_000FFF1AE6F2",
  gettClientId: process.env.GETT_CLIENT_ID || "",
  gettClientSecret: process.env.GETT_CLIENT_SECRET || "",
  gettBusinessId: process.env.GETT_BUSINESS_ID || "",
};

export function validateConfig(): void {
  if (!config.anthropicApiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is required.");
    console.error("Create a .env file based on .env.example at:", envPath);
    process.exit(1);
  }
}
