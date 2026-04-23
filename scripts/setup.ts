/**
 * Interactive setup wizard for Limor WhatsApp AI Bot.
 * Run: npm run setup
 *
 * No external dependencies — uses Node.js built-in readline.
 * Works on macOS, Linux, and Windows.
 */
import * as readline from "readline";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
  statSync,
} from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "..");
const SOULS_DIR = join(ROOT, "souls");
const ENV_EXAMPLE = join(ROOT, ".env.example");
const ENV_PATH = join(ROOT, ".env");
const WS_IDENTITY = join(ROOT, "workspace", "identity");
const OWNER_JSON_PATH = join(ROOT, "workspace", "owner.json");
const MEMORY_DIR = join(ROOT, "workspace", "memory");

// ── Readline helpers ─────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string, defaultVal?: string): Promise<string> {
  const hint = defaultVal ? ` [${defaultVal}]` : "";
  return new Promise((res) => {
    rl.question(`  ${question}${hint}: `, (answer) => {
      res(answer.trim() || defaultVal || "");
    });
  });
}

function askYesNo(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((res) => {
    rl.question(`  ${question} ${hint}: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") return res(defaultYes);
      res(a === "y" || a === "yes" || a === "כן");
    });
  });
}

function askSecret(question: string): Promise<string> {
  return new Promise((res) => {
    rl.question(`  ${question}: `, (answer) => {
      res(answer.trim());
    });
  });
}

async function askChoice<T extends string>(
  question: string,
  choices: { value: T; label: string }[],
  defaultValue: T
): Promise<T> {
  const lines = choices.map((c, i) => `    ${i + 1}. ${c.label}`);
  const defaultIdx = choices.findIndex((c) => c.value === defaultValue) + 1;
  console.log(`  ${question}`);
  console.log(lines.join("\n"));
  const ans = await ask("Choice", String(defaultIdx));
  const idx = parseInt(ans, 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx].value;
  return defaultValue;
}

// ── Validators ───────────────────────────────────────────

function isValidPhone(phone: string): boolean {
  return /^972\d{8,9}$/.test(phone);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidApiKey(key: string): boolean {
  return key.startsWith("sk-ant-");
}

// ── Banner ───────────────────────────────────────────────

function printBanner(assistantName = "Limor") {
  console.log("");
  console.log(
    "  ╔══════════════════════════════════════════════════════╗"
  );
  console.log(
    "  ║                                                      ║"
  );
  console.log(
    `  ║   ${assistantName} Setup Wizard / אשף ההתקנה                     ║`
  );
  console.log(
    "  ║                                                      ║"
  );
  console.log(
    "  ║   Personal AI WhatsApp Assistant                     ║"
  );
  console.log(
    "  ║   עוזרת אישית חכמה בוואטסאפ                         ║"
  );
  console.log(
    "  ║                                                      ║"
  );
  console.log(
    "  ╚══════════════════════════════════════════════════════╝"
  );
  console.log("");
}

function printSection(title: string) {
  console.log("");
  console.log(`  --- ${title} ---`);
  console.log("");
}

// ── Memory backup ────────────────────────────────────────

/**
 * Before writing a fresh owner.json we back up any existing personal memory
 * so two owners don't share personality notes, passport numbers, etc.
 */
function backupMemoryIfNeeded(): string | null {
  if (!existsSync(MEMORY_DIR)) return null;
  const usersDir = join(MEMORY_DIR, "users");
  const hasUserFiles = existsSync(usersDir) && readdirSync(usersDir).some((f) => f.endsWith(".md") && f !== ".gitkeep");
  const hasOwnerProfile = existsSync(join(MEMORY_DIR, "owner_profile.md"));
  if (!hasUserFiles && !hasOwnerProfile) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = join(ROOT, "workspace", `memory.backup-${ts}`);
  mkdirSync(backupDir, { recursive: true });

  // Copy users/ recursively
  if (existsSync(usersDir)) {
    const destUsers = join(backupDir, "users");
    mkdirSync(destUsers, { recursive: true });
    for (const f of readdirSync(usersDir)) {
      if (f === ".gitkeep") continue;
      const src = join(usersDir, f);
      if (statSync(src).isFile()) copyFileSync(src, join(destUsers, f));
    }
  }
  if (hasOwnerProfile) {
    copyFileSync(join(MEMORY_DIR, "owner_profile.md"), join(backupDir, "owner_profile.md"));
  }

  // Clear users/ (keep .gitkeep)
  if (existsSync(usersDir)) {
    for (const f of readdirSync(usersDir)) {
      if (f === ".gitkeep") continue;
      try {
        renameSync(join(usersDir, f), join(backupDir, "users", f));
      } catch {
        // Already moved above — ignore
      }
    }
  }

  return backupDir;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  printBanner();

  // ─── Step 1: Bot name ──────────────────────────────────

  printSection("Step 1: Assistant Name / שם העוזרת");

  const botNameHe = await ask("Assistant name in Hebrew / שם העוזרת בעברית", "לימור");
  const defaultEn = botNameHe === "לימור" ? "Limor" : "";
  const botNameEn = await ask("Assistant name in English / שם העוזרת באנגלית", defaultEn);

  if (!botNameEn) {
    console.log("\n  Error: English name is required.\n");
    rl.close();
    process.exit(1);
  }

  // ─── Step 2: Owner details ─────────────────────────────

  printSection("Step 2: Owner Details / פרטי הבעלים");

  const ownerName = await ask("Your first name in Hebrew / שם פרטי בעברית");
  if (!ownerName) {
    console.log("\n  Error: Owner name is required.\n");
    rl.close();
    process.exit(1);
  }

  const ownerFullName = await ask("Your full name in Hebrew / שם מלא בעברית", ownerName);
  const ownerNameEn = await ask("Your name in English (optional) / שם באנגלית");

  const gender = await askChoice<"male" | "female">(
    "Your gender (affects Hebrew pronoun agreement) / המין שלך (משפיע על פניה בעברית):",
    [
      { value: "male", label: "זכר / Male" },
      { value: "female", label: "נקבה / Female" },
    ],
    "male"
  );

  let ownerPhone = "";
  while (true) {
    ownerPhone = await ask("Phone number (972XXXXXXXXX format) / מספר טלפון");
    if (!ownerPhone) break;
    if (isValidPhone(ownerPhone)) break;
    console.log("    Invalid format. Use Israeli format: 972XXXXXXXXX (e.g. 972521234567)");
  }

  let ownerEmail = "";
  while (true) {
    ownerEmail = await ask("Email address / כתובת אימייל");
    if (!ownerEmail) break;
    if (isValidEmail(ownerEmail)) break;
    console.log("    Invalid email format. Try again.");
  }

  // ─── Step 3: Family (optional) ─────────────────────────

  printSection("Step 3: Family (optional) / בני משפחה (אופציונלי)");
  console.log("  Adding family members helps the assistant handle permissions and references.");
  console.log("  שמירת בני משפחה עוזרת לעוזרת להתייחס אליהם בצורה טבעית.");
  console.log("");

  const family: Array<{
    name: string;
    fullName?: string;
    relation: string;
    hasPrivilegedAccess?: boolean;
  }> = [];

  const wantFamily = await askYesNo("Add family members? / להוסיף בני משפחה?", false);
  if (wantFamily) {
    while (true) {
      const name = await ask("Family member first name (empty to finish) / שם פרטי (ריק = סיום)");
      if (!name) break;
      const fullName = await ask("  Full name (optional) / שם מלא", name);
      const relation = await askChoice<string>(
        "  Relation / קשר משפחתי:",
        [
          { value: "father", label: "אבא / Father" },
          { value: "mother", label: "אמא / Mother" },
          { value: "spouse", label: "בן/בת זוג / Spouse" },
          { value: "sibling", label: "אח/ות / Sibling" },
          { value: "child", label: "ילד/ה / Child" },
          { value: "other", label: "אחר / Other" },
        ],
        "other"
      );
      const privileged = await askYesNo(
        "  Grant privileged access (CRM, sensitive data)? / הרשאות מתקדמות?",
        false
      );
      family.push({
        name,
        fullName: fullName !== name ? fullName : undefined,
        relation,
        hasPrivilegedAccess: privileged,
      });
      const more = await askYesNo("  Add another family member? / להוסיף עוד?", false);
      if (!more) break;
    }
  }

  // ─── Step 4: Anthropic API Key ─────────────────────────

  printSection("Step 4: AI API Key / מפתח API (Required)");

  console.log("  Get your key at: https://console.anthropic.com");
  console.log("");

  let apiKey = "";
  while (true) {
    apiKey = await askSecret("Anthropic API Key (starts with sk-ant-)");
    if (!apiKey) {
      console.log("    API key is required. Cannot continue without it.");
      continue;
    }
    if (isValidApiKey(apiKey)) break;
    console.log("    Invalid key format. Must start with 'sk-ant-'. Try again.");
  }

  // ─── Step 5: Integrations (feature flags) ──────────────

  printSection("Step 5: Integrations / אינטגרציות");
  console.log("  Enable the features you want. Mac-only features require running on macOS.");
  console.log("");

  const intAppleCalendar = await askYesNo("Apple Calendar (macOS only)? / יומן Apple (רק במק)?", true);
  const intIMessage = await askYesNo("iMessage reading (macOS only)? / קריאת iMessage?", true);
  const intSms = await askYesNo(
    "SMS watcher (forward bank/insurance SMS to WhatsApp, macOS only)? / מעקב SMS?",
    false
  );
  const intTelegramAlerts = await askYesNo(
    "Telegram public channel alerts (rocket alerts, news)? / התרעות מערוצי טלגרם ציבוריים?",
    false
  );
  const intCapabilities = await askYesNo(
    "Self-programming via Claude Code CLI (advanced)? / עריכה-עצמית של קוד (מתקדם)?",
    false
  );

  // ─── Step 6: SMS watched senders ───────────────────────

  const smsWatchedSenders: Array<{
    sender: string;
    label: string;
    emoji: string;
    keywords?: string[];
    excludeKeywords?: string[];
  }> = [];

  if (intSms) {
    printSection("Step 6: SMS Watched Senders / שולחי SMS לעקוב");
    console.log("  Add senders whose SMS should be forwarded to WhatsApp.");
    console.log("  (Common ones: HAREL, AMEX, Isracard, bit)");
    console.log("");
    while (true) {
      const sender = await ask("Sender name (empty to finish) / שם שולח");
      if (!sender) break;
      const label = await ask("  Label / תווית", sender);
      const emoji = await ask("  Emoji / אימוג'י", "📩");
      smsWatchedSenders.push({ sender, label, emoji });
      const more = await askYesNo("  Add another sender? / להוסיף עוד?", false);
      if (!more) break;
    }
  }

  // ─── Telegram channels ──────────────────────────────────

  const telegramChannels: Array<{
    name: string;
    label: string;
    emoji: string;
    alertKeywords?: string[];
    excludeKeywords?: string[];
  }> = [];

  if (intTelegramAlerts) {
    printSection("Step 6b: Telegram Channels / ערוצי טלגרם ציבוריים");
    console.log("  Enter Telegram channel usernames (without @) to monitor.");
    console.log("  Examples: beforeredalert (rocket alerts), almogboker78 (news).");
    console.log("  A fresh install has no channels — only add what YOU want.");
    console.log("");
    while (true) {
      const name = await ask("Channel username (empty to finish) / שם ערוץ");
      if (!name) break;
      const label = await ask("  Label / תווית", name);
      const emoji = await ask("  Emoji / אימוג'י", "📢");
      telegramChannels.push({ name, label, emoji });
      const more = await askYesNo("  Add another channel? / להוסיף עוד?", false);
      if (!more) break;
    }
  }

  // ─── Step 7: Optional external services ────────────────

  printSection("Step 7: Optional External Services / שירותים חיצוניים (אופציונלי)");
  console.log("  You can skip these and add them later by editing .env.");
  console.log("");

  let googleClientId = "";
  let googleClientSecret = "";
  let googleRefreshToken = "";
  const wantGCal = await askYesNo("Google Calendar integration? / יומן גוגל?", false);
  if (wantGCal) {
    googleClientId = await ask("  Google Client ID");
    googleClientSecret = await ask("  Google Client Secret");
    googleRefreshToken = await ask("  Google Refresh Token");
  }

  let smtpEmail = "";
  let smtpPassword = "";
  const wantEmail = await askYesNo("Email sending (SMTP)? / שליחת אימיילים?", false);
  if (wantEmail) {
    smtpEmail = await ask("  SMTP Email (Gmail address)");
    smtpPassword = await askSecret("  SMTP App Password");
  }

  let crmApiUrl = "";
  let crmUsername = "";
  let crmPassword = "";
  let crmLabel = "";
  const wantCrm = await askYesNo("CRM integration? / CRM?", false);
  if (wantCrm) {
    crmApiUrl = await ask("  CRM API URL");
    crmUsername = await ask("  CRM Username");
    crmPassword = await askSecret("  CRM Password");
    crmLabel = await ask("  CRM label (e.g. 'ביטוח אופיר') / תווית ל-CRM", "CRM");
  }

  let harbIdNumber = "";
  let harbPassword = "";
  const wantHarb = await askYesNo("Har HaBituach (insurance policies scraper)? / הר הביטוח?", false);
  if (wantHarb) {
    harbIdNumber = await ask("  ID number / תעודת זהות");
    harbPassword = await askSecret("  Password / סיסמה");
  }

  let braveKey = "";
  let rapidApiKey = "";
  const wantSearch = await askYesNo("Web search? / חיפוש באינטרנט?", false);
  if (wantSearch) {
    braveKey = await ask("  Brave Search API Key (brave.com/search/api)");
    rapidApiKey = await ask("  RapidAPI Key (flights/hotels, optional)");
  }

  let c4Ip = "";
  let c4User = "";
  let c4Pass = "";
  const wantSmartHome = await askYesNo("Smart Home (Control4)? / בית חכם?", false);
  if (wantSmartHome) {
    c4Ip = await ask("  Control4 Director IP");
    c4User = await ask("  Control4 Username");
    c4Pass = await askSecret("  Control4 Password");
  }

  let gettClientId = "";
  let gettClientSecret = "";
  let gettBusinessId = "";
  const wantGett = await askYesNo("Gett Taxi? / Gett?", false);
  if (wantGett) {
    gettClientId = await ask("  Gett Client ID");
    gettClientSecret = await ask("  Gett Client Secret");
    gettBusinessId = await ask("  Gett Business ID");
  }

  // ─── Step 8: Backup existing memory & write files ──────

  printSection("Generating configuration files...");

  // Backup any prior owner's memory so we don't mix identities
  const backup = backupMemoryIfNeeded();
  if (backup) {
    console.log(`  📦 Backed up previous memory to: ${backup}`);
  }

  const soulSlug = botNameEn.toLowerCase().replace(/[^a-z0-9]/g, "");

  // ─── Write .env ────────────────────────────────────────
  const envContent = `# ═══════════════════════════════════════════════════════════
# Bot Configuration
# ═══════════════════════════════════════════════════════════

BOT_NAME=${botNameHe}
BOT_NAME_EN=${botNameEn}
SOUL_NAME=${soulSlug}

# ═══════════════════════════════════════════════════════════
# Owner Configuration
# Primary source of truth is workspace/owner.json; these env vars are fallbacks.
# ═══════════════════════════════════════════════════════════

OWNER_NAME=${ownerName}
OWNER_CHAT_ID=
OWNER_PHONE=${ownerPhone}
OWNER_EMAIL=${ownerEmail}

# ═══════════════════════════════════════════════════════════
# AI
# ═══════════════════════════════════════════════════════════

ANTHROPIC_API_KEY=${apiKey}
OPENAI_API_KEY=

# ═══════════════════════════════════════════════════════════
# Google Calendar
# ═══════════════════════════════════════════════════════════

GOOGLE_CLIENT_ID=${googleClientId}
GOOGLE_CLIENT_SECRET=${googleClientSecret}
GOOGLE_REFRESH_TOKEN=${googleRefreshToken}

# ═══════════════════════════════════════════════════════════
# Email (SMTP)
# ═══════════════════════════════════════════════════════════

SMTP_EMAIL=${smtpEmail}
SMTP_PASSWORD=${smtpPassword}

# ═══════════════════════════════════════════════════════════
# CRM
# ═══════════════════════════════════════════════════════════

CRM_API_URL=${crmApiUrl}
CRM_USERNAME=${crmUsername}
CRM_PASSWORD=${crmPassword}

# ═══════════════════════════════════════════════════════════
# Har HaBituach (insurance policy scraper)
# ═══════════════════════════════════════════════════════════

HARB_ID_NUMBER=${harbIdNumber}
HARB_PASSWORD=${harbPassword}

# ═══════════════════════════════════════════════════════════
# Web Search
# ═══════════════════════════════════════════════════════════

BRAVE_SEARCH_API_KEY=${braveKey}
RAPIDAPI_KEY=${rapidApiKey}

# ═══════════════════════════════════════════════════════════
# Smart Home (Control4)
# ═══════════════════════════════════════════════════════════

CONTROL4_DIRECTOR_IP=${c4Ip}
CONTROL4_USERNAME=${c4User}
CONTROL4_PASSWORD=${c4Pass}

# ═══════════════════════════════════════════════════════════
# Gett Taxi
# ═══════════════════════════════════════════════════════════

GETT_CLIENT_ID=${gettClientId}
GETT_CLIENT_SECRET=${gettClientSecret}
GETT_BUSINESS_ID=${gettBusinessId}

# ═══════════════════════════════════════════════════════════
# Health (optional)
# ═══════════════════════════════════════════════════════════

# Daily calorie goal for health tool (0 = disabled)
HEALTH_DAILY_CALORIE_GOAL=0

# ═══════════════════════════════════════════════════════════
# Advanced Settings
# ═══════════════════════════════════════════════════════════

MAX_HISTORY=100
DEBUG_BRAIN_TRACE=false
`;

  if (existsSync(ENV_PATH)) {
    const overwrite = await askYesNo(".env already exists. Overwrite? / הקובץ .env קיים. לדרוס?", false);
    if (!overwrite) {
      console.log("  Skipping .env generation. Your existing .env was kept.");
    } else {
      writeFileSync(ENV_PATH, envContent, "utf-8");
      console.log("  .env file written.");
    }
  } else {
    writeFileSync(ENV_PATH, envContent, "utf-8");
    console.log("  .env file created.");
  }

  // ─── Write workspace/owner.json ────────────────────────

  const ownerJson = {
    name: ownerName,
    nameEn: ownerNameEn || undefined,
    fullName: ownerFullName !== ownerName ? ownerFullName : undefined,
    gender,
    phone: ownerPhone,
    email: ownerEmail,
    chatId: "",
    language: "he",
    family,
    assistant: {
      name: botNameHe,
      nameEn: botNameEn,
    },
    integrations: {
      appleCalendar: intAppleCalendar,
      sms: intSms,
      capabilities: intCapabilities,
      iMessage: intIMessage,
      googleCalendar: wantGCal,
      control4: wantSmartHome,
      gett: wantGett,
      crm: wantCrm,
      telegramAlerts: intTelegramAlerts,
    },
    smsWatchedSenders: smsWatchedSenders.length > 0 ? smsWatchedSenders : undefined,
    telegramChannels: telegramChannels.length > 0 ? telegramChannels : undefined,
    crmLabel: crmLabel || undefined,
  };

  writeFileSync(OWNER_JSON_PATH, JSON.stringify(ownerJson, null, 2), "utf-8");
  console.log("  workspace/owner.json created.");

  // ─── Ensure soul file exists ───────────────────────────

  const soulPath = join(SOULS_DIR, `${soulSlug}.json`);
  const limorSoulPath = join(SOULS_DIR, "limor.json");
  if (!existsSync(SOULS_DIR)) mkdirSync(SOULS_DIR, { recursive: true });

  if (!existsSync(soulPath)) {
    if (soulSlug !== "limor" && existsSync(limorSoulPath)) {
      // Copy limor.json as template — its {{placeholder}}s are rendered at load time.
      copyFileSync(limorSoulPath, soulPath);
      console.log(`  souls/${soulSlug}.json created (from limor.json template).`);
    } else {
      console.log(`  souls/${soulSlug}.json already exists, keeping it.`);
    }
  }

  // Reset owner_profile.md (avoid carrying over prior owner's notes)
  const ownerProfile = join(MEMORY_DIR, "owner_profile.md");
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(
    ownerProfile,
    `# פרופיל הבעלים - ${ownerFullName}\n\nהפרטים נטענים מ-workspace/owner.json בזמן ריצה.\nקובץ זה משמש כתיעוד בלבד.\n`,
    "utf-8"
  );

  // ─── Done ──────────────────────────────────────────────

  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log(`  ║  Setup complete! / ההתקנה הושלמה!                    ║`);
  console.log(`  ║  Your assistant "${botNameHe}" is ready.              ║`);
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  Next steps / צעדים הבאים:");
  console.log("");
  console.log("    1. npm run build");
  console.log("    2. npx pm2 start ecosystem.config.js");
  console.log("    3. Scan the QR code with WhatsApp / סרוק את קוד ה-QR");
  console.log("    4. Send a message — find OWNER_CHAT_ID in logs and add to .env");
  console.log("    5. npx pm2 restart " + soulSlug);
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error("\n  Setup failed:", err.message || err);
  rl.close();
  process.exit(1);
});
