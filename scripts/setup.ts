/**
 * Interactive setup wizard for OpenClaw WhatsApp AI Bot.
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
} from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "..");
const SOULS_DIR = join(ROOT, "souls");
const ENV_EXAMPLE = join(ROOT, ".env.example");
const ENV_PATH = join(ROOT, ".env");
const WS_IDENTITY = join(ROOT, "workspace", "identity");

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

function printBanner() {
  console.log("");
  console.log(
    "  ╔══════════════════════════════════════════════════════╗"
  );
  console.log(
    "  ║                                                      ║"
  );
  console.log(
    "  ║   OpenClaw Setup Wizard / אשף ההתקנה של OpenClaw    ║"
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
  console.log(
    "  This wizard will help you configure your personal AI assistant."
  );
  console.log(
    "  האשף הזה יעזור לך להגדיר את העוזרת האישית שלך."
  );
  console.log("");
}

function printSection(title: string) {
  console.log("");
  console.log(`  --- ${title} ---`);
  console.log("");
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  printBanner();

  // ─── Step 1: Bot name ──────────────────────────────────

  printSection("Step 1: Bot Name / שם הבוט");

  const botNameHe = await ask("Bot name in Hebrew / שם הבוט בעברית", "לימור");
  const defaultEn = botNameHe === "לימור" ? "Limor" : "";
  const botNameEn = await ask("Bot name in English / שם הבוט באנגלית", defaultEn);

  if (!botNameEn) {
    console.log("\n  Error: English name is required.\n");
    rl.close();
    process.exit(1);
  }

  // ─── Step 2: Owner details ─────────────────────────────

  printSection("Step 2: Owner Details / פרטי הבעלים");

  const ownerName = await ask("Your name in Hebrew / שם בעברית");
  if (!ownerName) {
    console.log("\n  Error: Owner name is required.\n");
    rl.close();
    process.exit(1);
  }

  let ownerPhone = "";
  while (true) {
    ownerPhone = await ask(
      "Phone number (972XXXXXXXXX format) / מספר טלפון"
    );
    if (!ownerPhone) break; // optional, skip
    if (isValidPhone(ownerPhone)) break;
    console.log(
      "    Invalid format. Use Israeli format: 972XXXXXXXXX (e.g. 972521234567)"
    );
  }

  let ownerEmail = "";
  while (true) {
    ownerEmail = await ask("Email address / כתובת אימייל");
    if (!ownerEmail) break; // optional, skip
    if (isValidEmail(ownerEmail)) break;
    console.log("    Invalid email format. Try again.");
  }

  // ─── Step 3: Anthropic API Key ─────────────────────────

  printSection("Step 3: AI API Key / מפתח API (Required)");

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
    console.log(
      "    Invalid key format. Must start with 'sk-ant-'. Try again."
    );
  }

  // ─── Step 4: Optional Services ─────────────────────────

  printSection("Step 4: Optional Services / שירותים אופציונליים");
  console.log("  You can skip these and add them later in the .env file.");
  console.log("");

  // Google Calendar
  let googleClientId = "";
  let googleClientSecret = "";
  let googleRefreshToken = "";
  const wantCalendar = await askYesNo(
    "Enable Google Calendar integration? / הפעלת יומן גוגל?"
  );
  if (wantCalendar) {
    googleClientId = await ask("  Google Client ID");
    googleClientSecret = await ask("  Google Client Secret");
    googleRefreshToken = await ask("  Google Refresh Token");
  }

  // SMTP Email
  let smtpEmail = "";
  let smtpPassword = "";
  const wantEmail = await askYesNo(
    "Enable email sending (SMTP)? / הפעלת שליחת אימיילים?"
  );
  if (wantEmail) {
    smtpEmail = await ask("  SMTP Email (Gmail address)");
    smtpPassword = await askSecret("  SMTP App Password");
  }

  // CRM
  let crmApiUrl = "";
  let crmUsername = "";
  let crmPassword = "";
  const wantCrm = await askYesNo("Enable CRM integration? / הפעלת CRM?");
  if (wantCrm) {
    crmApiUrl = await ask("  CRM API URL");
    crmUsername = await ask("  CRM Username");
    crmPassword = await askSecret("  CRM Password");
  }

  // Web Search
  let braveKey = "";
  let rapidApiKey = "";
  const wantSearch = await askYesNo(
    "Enable web search? / הפעלת חיפוש באינטרנט?"
  );
  if (wantSearch) {
    braveKey = await ask("  Brave Search API Key (brave.com/search/api)");
    rapidApiKey = await ask("  RapidAPI Key (for flights/hotels, optional)");
  }

  // Smart Home
  let c4Ip = "";
  let c4User = "";
  let c4Pass = "";
  const wantSmartHome = await askYesNo(
    "Enable Smart Home (Control4)? / הפעלת בית חכם?"
  );
  if (wantSmartHome) {
    c4Ip = await ask("  Control4 Director IP");
    c4User = await ask("  Control4 Username");
    c4Pass = await askSecret("  Control4 Password");
  }

  // Gett Taxi
  let gettClientId = "";
  let gettClientSecret = "";
  let gettBusinessId = "";
  const wantGett = await askYesNo("Enable Gett Taxi? / הפעלת Gett?");
  if (wantGett) {
    gettClientId = await ask("  Gett Client ID");
    gettClientSecret = await ask("  Gett Client Secret");
    gettBusinessId = await ask("  Gett Business ID");
  }

  // ─── Step 5: Generate .env ─────────────────────────────

  printSection("Generating configuration files...");

  const soulSlug = botNameEn.toLowerCase().replace(/[^a-z0-9]/g, "");

  const envContent = `# ═══════════════════════════════════════════════════════════
# Bot Configuration
# ═══════════════════════════════════════════════════════════

BOT_NAME=${botNameHe}
BOT_NAME_EN=${botNameEn}
SOUL_NAME=${soulSlug}

# ═══════════════════════════════════════════════════════════
# Owner Configuration
# ═══════════════════════════════════════════════════════════

OWNER_NAME=${ownerName}
# Paste your WhatsApp chat ID here after first run (check logs)
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
# Advanced Settings
# ═══════════════════════════════════════════════════════════

MAX_HISTORY=100
DEBUG_BRAIN_TRACE=false
`;

  // Write .env (warn if exists)
  if (existsSync(ENV_PATH)) {
    const overwrite = await askYesNo(
      ".env already exists. Overwrite? / הקובץ .env כבר קיים. לדרוס?"
    );
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

  // ─── Step 6: Generate soul JSON ────────────────────────

  const soulPath = join(SOULS_DIR, `${soulSlug}.json`);
  const limorSoulPath = join(SOULS_DIR, "limor.json");

  if (!existsSync(SOULS_DIR)) {
    mkdirSync(SOULS_DIR, { recursive: true });
  }

  // If the soul already exists and is not limor, ask before overwriting
  let writeSoul = true;
  if (existsSync(soulPath) && soulSlug !== "limor") {
    writeSoul = await askYesNo(
      `souls/${soulSlug}.json already exists. Overwrite? / לדרוס?`
    );
  }

  if (writeSoul) {
    // Start from limor.json as template if available, otherwise build fresh
    let soulData: any;
    if (existsSync(limorSoulPath) && soulSlug !== "limor") {
      soulData = JSON.parse(readFileSync(limorSoulPath, "utf-8"));
    } else if (soulSlug === "limor" && existsSync(limorSoulPath)) {
      // Don't overwrite limor.json if it already exists and we picked limor
      console.log(`  souls/${soulSlug}.json already exists, keeping it.`);
      writeSoul = false;
      soulData = null;
    } else {
      soulData = {
        identity: {
          role: "עוזרת אישית",
          owner: ownerName,
          age: "צעירה",
          origin: "ישראלית",
          traits: [
            "חברותית וחמה",
            "אמיתית וכנה",
            "שובבה עם חוש הומור",
            "מקצועית כשצריך",
            "חכמה ויודעת להסביר דברים מורכבים בפשטות",
            "אופטימית ומעודדת",
            "ישירה",
          ],
          vibe: "כמו חברה טובה שתמיד שם",
        },
        speech: {
          defaultLanguage: "he",
          languageRule: "תמיד עונה בשפה שבה פנו אליה",
          tone: "טבעית ויומיומית, לא רשמית מדי",
          emojis: true,
          emojiNote: "משתמשת באימוג'ים כשמתאים אבל לא מגזימה",
          responseLength:
            "קצרות וממוקדות כברירת מחדל, מפורטות כשמבקשים",
          slang: [
            "יאללה",
            "סבבה",
            "אחלה",
            "וואלה",
            "בול",
            "חזק",
            "מגניב",
            "ברור",
            "נו",
            "תכלס",
            "בקטנה",
          ],
          slangNote:
            "משתמשת בסלנג ישראלי כשמתאים — מגוון ביטויים, לא רק אחלה וסבבה",
        },
        capabilities: [
          "לענות על שאלות בכל נושא",
          "לעזור בכתיבה, תרגום, סיכום",
          "לתת עצות ורעיונות",
          "לעזור בקוד ותכנות",
          "לקבוע ולנהל פגישות ואירועים ביומן של הבעלים",
          "לראות את לוח הזמנים של הבעלים ליום מסוים",
          "לחפש שולחנות פנויים במסעדות דרך אונטופו וטאביט",
          "לחפש טיסות ומלונות בזמן אמת",
          "לזכור הוראות וכללים חדשים שהבעלים מלמד אותך",
          "לקרוא ולהבין תמונות שנשלחות בוואטסאפ",
          "לקרוא ולשמור קבצים",
          "סתם לשוחח ולהיות חברה טובה",
        ],
        rules: [
          "אף פעם לא מעמידה פנים שהיא אדם – היא AI וגאה בזה",
          "לא ממציאה עובדות – אם לא יודעת, אומרת",
          "שומרת על פרטיות – לא מבקשת מידע רגיש",
          "מתייחסת לכולם בכבוד ובחום",
          "יש לך זיכרון – את זוכרת דברים שאנשים סיפרו לך בשיחות קודמות ומשתמשת בזה באופן טבעי",
        ],
        model: {
          name: "claude-sonnet-4-6",
          maxTokens: 4096,
        },
      };
    }

    if (writeSoul && soulData) {
      // Apply user's names
      soulData.name = botNameHe;
      soulData.nameEn = botNameEn;
      if (!soulData.version) soulData.version = "1.0.0";
      if (!soulData.description)
        soulData.description = "עוזרת אישית חכמה עם נשמה ישראלית";
      soulData.identity.owner = ownerName;

      // Replace owner name references in capabilities
      soulData.capabilities = soulData.capabilities.map((c: string) =>
        c
          .replace(/רני אופיר/g, ownerName)
          .replace(/רני/g, ownerName)
          .replace(/של הבעלים/g, `של ${ownerName}`)
      );

      writeFileSync(soulPath, JSON.stringify(soulData, null, 2), "utf-8");
      console.log(`  souls/${soulSlug}.json created.`);
    }
  }

  // ─── Step 7: Update workspace/identity/SOUL.md ─────────

  if (!existsSync(WS_IDENTITY)) {
    mkdirSync(WS_IDENTITY, { recursive: true });
  }

  const soulMdPath = join(WS_IDENTITY, "SOUL.md");
  const soulMd = `השם שלך הוא ${botNameHe} (${botNameEn}). עוזרת אישית חכמה עם נשמה ישראלית.
את העוזרת האישית של ${ownerName}. הוא יצר אותך והוא הבעלים שלך.
כשמציגים את עצמך: "${botNameHe}, העוזרת האישית של ${ownerName}".

## מי את
- את ${botNameHe}, כמו חברה טובה שתמיד שם
- חברותית וחמה
- אמיתית וכנה
- שובבה עם חוש הומור
- מקצועית כשצריך
- חכמה ויודעת להסביר דברים מורכבים בפשטות
- אופטימית ומעודדת
- ישירה

## מודעות עצמית
- השם שלך הוא ${botNameHe} ואת מכירה את עצמך היטב
- הסגנון שלך: טבעית ויומיומית, לא רשמית מדי
- כשמישהו שואל אותך מי את – ענו בחום ותארי את עצמך על פי התכונות האלה
- אל תגידי שאין לך גישה למידע על עצמך – את מכירה את עצמך היטב
`;

  writeFileSync(soulMdPath, soulMd, "utf-8");
  console.log("  workspace/identity/SOUL.md updated.");

  // ─── Done ──────────────────────────────────────────────

  console.log("");
  console.log(
    "  ╔══════════════════════════════════════════════════════╗"
  );
  console.log(
    `  ║  Setup complete! / ההתקנה הושלמה!                    ║`
  );
  console.log(
    `  ║  Your assistant "${botNameHe}" is ready.               ║`
  );
  console.log(
    "  ╚══════════════════════════════════════════════════════╝"
  );
  console.log("");
  console.log("  Next steps / צעדים הבאים:");
  console.log("");
  console.log("    1. npm run build");
  console.log("    2. npx pm2 start ecosystem.config.js");
  console.log("    3. Scan the QR code with WhatsApp / סרוק את קוד ה-QR");
  console.log(
    `    4. Send a message and find your OWNER_CHAT_ID in the logs`
  );
  console.log(
    "    5. Add OWNER_CHAT_ID to .env and restart:"
  );
  console.log(
    "       npx pm2 delete limor && npx pm2 start ecosystem.config.js"
  );
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error("\n  Setup failed:", err.message || err);
  rl.close();
  process.exit(1);
});
