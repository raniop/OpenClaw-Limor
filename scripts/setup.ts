/**
 * First-time setup wizard.
 * Run: npx ts-node scripts/setup.ts
 * Or:  npm run setup
 */
import * as readline from "readline";
import { writeFileSync, readFileSync, existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function main() {
  console.log("\n🐾 Welcome to Limor Setup!\n");
  console.log("This wizard will configure your personal AI WhatsApp assistant.\n");

  // --- Assistant name ---
  const nameHe = await ask("שם העוזרת בעברית", "לימור");
  const nameEn = await ask("Assistant name in English", nameHe === "לימור" ? "Limor" : "");
  const description = await ask("תיאור קצר (עברית)", "עוזרת אישית חכמה עם נשמה ישראלית");

  // --- Owner details ---
  console.log("\n📋 פרטי הבעלים (שלך):\n");
  const ownerName = await ask("שם מלא");
  const ownerPhone = await ask("מספר טלפון (למשל: 0521234567)");
  const ownerEmail = await ask("אימייל");

  // --- API Key ---
  console.log("\n🔑 מפתחות API:\n");
  const apiKey = await ask("Anthropic API Key (sk-ant-...)");

  if (!apiKey) {
    console.error("\n❌ API Key is required! Get one at https://console.anthropic.com\n");
    process.exit(1);
  }

  // --- Generate soul JSON ---
  const soulName = nameEn.toLowerCase().replace(/[^a-z0-9]/g, "");
  const soulPath = resolve(__dirname, "..", "souls", `${soulName}.json`);

  const soul = {
    name: nameHe,
    nameEn: nameEn,
    version: "1.0.0",
    description: description,
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
      responseLength: "קצרות וממוקדות כברירת מחדל, מפורטות כשמבקשים",
      slang: ["יאללה", "סבבה", "אחלה", "וואלה"],
      slangNote: "משתמשת בסלנג ישראלי כשמתאים",
    },
    capabilities: [
      "לענות על שאלות בכל נושא",
      "לעזור בכתיבה, תרגום, סיכום",
      "לתת עצות ורעיונות",
      "לעזור בקוד ותכנות",
      `לקבוע ולנהל פגישות ואירועים ביומן של ${ownerName || "הבעלים"}`,
      `לראות את לוח הזמנים של ${ownerName || "הבעלים"} ליום מסוים`,
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
      maxTokens: 1024,
    },
  };

  writeFileSync(soulPath, JSON.stringify(soul, null, 2), "utf-8");
  console.log(`\n✅ Soul file created: souls/${soulName}.json`);

  // --- Update workspace identity files ---
  const wsIdentity = resolve(__dirname, "..", "workspace", "identity");
  const soulMd = `השם שלך הוא ${nameHe} (${nameEn}). ${description}.
את העוזרת האישית של ${ownerName}. הוא יצר אותך והוא הבעלים שלך.
כשמציגים את עצמך: "${nameHe}, העוזרת האישית של ${ownerName}".

⚠️ חוק מוחלט: אף פעם, בשום מצב, לא להגיד "עוזרת דיגיטלית". אף פעם לא "עוזרת AI". אף פעם לא "OpenClaw". אף פעם לא "Claude". את ${nameHe}, העוזרת האישית של ${ownerName}, ותו לא.

## מי את
- את ${nameHe}, כמו חברה טובה שתמיד שם
${soul.identity.traits.map((t) => `- ${t}`).join("\n")}

## מודעות עצמית
- השם שלך הוא ${nameHe} ואת מכירה את עצמך היטב
- התכונות שלך: ${soul.identity.traits.join(", ")}
- הסגנון שלך: ${soul.speech.tone}
- כשמישהו שואל אותך מי את – ענו בחום ותארי את עצמך על פי התכונות האלה
- אל תגידי שאין לך גישה למידע על עצמך – את מכירה את עצמך היטב

## מה את יודעת לעשות
${soul.capabilities.map((c) => `- ${c}`).join("\n")}
`;
  writeFileSync(resolve(wsIdentity, "SOUL.md"), soulMd, "utf-8");
  console.log("✅ workspace/identity/SOUL.md updated");

  // --- Generate .env ---
  const envPath = resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) {
    copyFileSync(resolve(__dirname, "..", ".env.example"), envPath);
  }

  let env = readFileSync(envPath, "utf-8");
  env = env.replace(/ANTHROPIC_API_KEY=.*/, `ANTHROPIC_API_KEY=${apiKey}`);
  env = env.replace(/OWNER_NAME=.*/, `OWNER_NAME=${ownerName}`);
  env = env.replace(/OWNER_PHONE=.*/, `OWNER_PHONE=${ownerPhone}`);
  env = env.replace(/OWNER_EMAIL=.*/, `OWNER_EMAIL=${ownerEmail}`);
  env = env.replace(/SOUL_NAME=.*/, `SOUL_NAME=${soulName}`);
  writeFileSync(envPath, env, "utf-8");
  console.log("✅ .env configured");

  console.log(`\n🎉 Setup complete! Your assistant "${nameHe}" is ready.`);
  console.log("\nNext steps:");
  console.log("  1. npm run build");
  console.log("  2. npm start");
  console.log("  3. Scan the QR code with WhatsApp");
  console.log(`  4. Send a message to ${nameHe} and find your OWNER_CHAT_ID in the logs`);
  console.log("  5. Add OWNER_CHAT_ID to .env and restart\n");

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
