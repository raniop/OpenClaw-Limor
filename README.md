# לימור 🐾 — WhatsApp AI Personal Assistant

עוזרת אישית חכמה לוואטסאפ, מבוססת Claude (Anthropic). מבינה עברית ואנגלית, מנהלת יומן, מזמינה מסעדות, מחפשת טיסות, שולחת הודעות, זוכרת הכל — ויודעת ללמוד מטעויות.

## ✨ יכולות

### שיחה ותקשורת
- 💬 **שיחה טבעית** — עברית, אנגלית, כל שפה
- 🎤 **הודעות קוליות** — מקבלת ומשיבה בקול (edge-tts)
- 📷 **ראייה** — מבינה תמונות שנשלחות
- 🧠 **זיכרון עמוק** — עובדות, העדפות, דפוסים, מצב רוח
- 📝 **למידה מתיקונים** — כשמתקנים אותה, היא שומרת את הלקח

### כלים ואינטגרציות
- 📅 **יומן** — Google Calendar (יצירה, מחיקה, צפייה)
- 🍽️ **מסעדות** — חיפוש והזמנה דרך Ontopo ו-Tabit
- ✈️ **טיסות ומלונות** — חיפוש בזמן אמת
- 🌐 **חיפוש אינטרנט** — Brave Search / DuckDuckGo
- 📊 **CRM** — ניהול פוליסות ביטוח
- 🏠 **בית חכם** — Control4
- 🚕 **מונית** — הזמנת Gett
- 📱 **SMS** — קריאת הודעות ומעקב משלוחים
- 📡 **טלגרם** — ניטור ערוצים (התרעות + חדשות) עם תמונות

### אוטומציות
- ⏰ **תזכורות יזומות** — followup reminders, התראות לפני פגישות
- 📊 **בריפינג יומי** — מה מחכה לך, מה פתוח, ימי הולדת
- 📋 **סיכומי שיחות** — executive briefing פעמיים ביום (14:00 + 23:00)
- 🔄 **מעקב אוטומטי** — יצירת followups מתוך שיחות

### אבטחה והרשאות
- 🔒 **אישור אנשי קשר** — רק מי שהבעלים אישר יכול לדבר
- 🛡️ **הפרדת הרשאות** — יומן, CRM, קבצים = רק בעלים
- 📅 **State Machine לפגישות** — בקשה → אישור → יצירה (אטומי בקוד)
- ⚠️ **Social engineering protection** — התראה כשמישהו טוען "רני ביקש"

### QA ומוניטורינג
- 🔬 **Operational Trace** — 25+ שדות לכל הודעה
- ✅ **Self-Check** — 12 בדיקות בוליאניות אחרי כל תגובה
- 📈 **Metrics** — tool precision, hallucination rate, task completion
- 🧪 **Benchmark Suite** — 24 תרחישים, 9 קטגוריות (87.5% pass rate)
- 🚦 **Pass/Fail Framework** — gating metrics + warnings
- 📊 **Dashboard** — מרכז בקרה עם לוגים, metrics, alerts

### אינטליגנציה
- 🧠 **17-Layer Context Engine** — הבנת הקשר דטרמיניסטית
- 😊 **Mood Detection** — 7 מצבי רוח, התאמת טון
- 🔀 **Smart Model Router** — Opus למורכב, Sonnet לפשוט
- 🔁 **Tool Retry** — ניסיון שני אוטומטי על כשל
- 🚫 **Anti-Hallucination** — כללי ברזל + retry אוטומטי
- 🔗 **Multi-step Planning** — תכנון וביצוע משימות מורכבות

## 🚀 התקנה

```bash
# Clone
git clone https://github.com/raniop/OpenClaw-Limor.git
cd OpenClaw-Limor

# Dependencies
npm install

# Setup wizard (שם, טלפון, API key)
npm run setup

# Build
npm run build

# Run
npm start
```

### Quick Start (macOS)
דאבל-קליק על **`Start Limor.command`** — בונה, מפעיל עם PM2, מעלה dashboard, פותח דפדפן.

## ⚙️ הגדרות

| משתנה | חובה | תיאור |
|-------|------|--------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key |
| `OWNER_CHAT_ID` | מומלץ | WhatsApp chat ID שלך |
| `OWNER_NAME` | מומלץ | השם שלך |
| `OWNER_PHONE` | מומלץ | טלפון (למילוי אוטומטי) |
| `GOOGLE_CLIENT_ID` | אופציונלי | Google Calendar |
| `GOOGLE_CLIENT_SECRET` | אופציונלי | Google Calendar |
| `GOOGLE_REFRESH_TOKEN` | אופציונלי | Google Calendar |
| `BRAVE_SEARCH_API_KEY` | אופציונלי | חיפוש אינטרנט (fallback: DuckDuckGo) |
| `RAPIDAPI_KEY` | אופציונלי | טיסות ומלונות |
| `CRM_API_URL` | אופציונלי | CRM server |

## 🏗️ ארכיטקטורה

```
src/
├── ai/                    # Claude API, tools, model router
│   ├── send-message.ts    # Core message loop + hallucination guard
│   ├── model-router.ts    # Smart Opus/Sonnet routing
│   ├── tools/             # 75+ tool definitions
│   └── extract-facts.ts   # Background memory extraction
├── context/               # 17-layer context engine
│   ├── mood-detector.ts   # Emotional state detection
│   ├── turn-intent.ts     # Intent classification
│   ├── response-mode.ts   # Tone/brevity adaptation
│   ├── correction-learner.ts # Learn from user corrections
│   └── ...                # 14 more resolver layers
├── whatsapp/              # WhatsApp client + handlers
│   ├── index.ts           # Message routing + PM2
│   ├── voice-response.ts  # TTS voice replies
│   └── response-handler.ts # Response dispatch
├── meetings/              # Meeting state machine
│   ├── meeting-state.ts   # Full lifecycle management
│   └── time-parser.ts     # Hebrew time expression parser
├── ops/                   # Operational QA
│   ├── operational-trace.ts # Per-message trace
│   ├── self-check.ts      # 12 boolean post-checks
│   ├── metrics.ts         # System health metrics
│   └── pass-fail.ts       # Release gate framework
├── proactive/             # Proactive messaging
│   ├── proactive-engine.ts # Followup/calendar/morning checks
│   └── rate-limiter.ts    # Anti-spam protection
├── digest/                # Daily briefings
│   ├── digest-service.ts  # Morning briefing
│   └── daily-summaries.ts # Executive briefings
├── telegram/              # Channel monitoring
│   └── alert-poller.ts    # Scraping + images + circuit breaker
├── memory.ts              # Deep memory (facts, preferences, patterns, emotional log)
├── conversation.ts        # History + rolling summary + rotation
├── web-search.ts          # Internet search
└── calendar.ts            # Google Calendar API

workspace/
├── identity/              # Bot personality
│   ├── SOUL.md            # Who is Limor
│   ├── VOICE.md           # How she talks
│   ├── OPERATING_PRINCIPLES.md # Iron rules
│   └── CAPABILITIES_MAP.md # What she knows she can do
├── policies/              # Behavioral policies
│   ├── calendar.md        # Meeting flow rules
│   ├── messaging.md       # Message sending rules
│   ├── multi_step.md      # Complex task planning
│   └── ...                # 6 more policies
└── state/                 # Runtime state (auto-created)

dashboard/                 # Next.js control panel
├── app/
│   ├── page.tsx           # Main dashboard
│   ├── ops/               # Operations & QA
│   ├── summaries/         # Daily conversation summaries
│   ├── followups/         # Task tracking
│   ├── contacts/          # Contact management
│   └── telegram/          # Monitored channels

tests/
├── scenarios/             # 24 benchmark scenarios (9 categories)
├── benchmark/             # Automated benchmark runner
└── context.test.ts        # Context engine tests

souls/
└── limor.json             # Personality + model config
```

## 📊 Dashboard

מרכז בקרה בעברית: `http://localhost:3848`

- **לוח בקרה** — סטטוס, אישורים, מעקבים, פעילות
- **תפעול ובקרה** — metrics, pass/fail, alerts, traces
- **סיכומים** — executive briefings יומיים
- **מעקבים** — followups ומשימות
- **אנשי קשר** — רשימה + מערכות יחסים
- **טלגרם** — ערוצים מנוטרים
- **לוגים** — real-time system logs

## 🧪 בדיקות

```bash
# Run benchmark suite (24 scenarios)
npm run benchmark

# Run unit tests
npm test
```

### Benchmark Results
```
context_understanding:    2/3  ✅
conversation_state:       3/3  ✅
response_strategy:        3/3  ✅
tool_usage:              3/3  ✅
missing_info:            3/3  ✅
mood_detection:          3/3  ✅
open_loops:              2/2  ✅
contradiction_detection:  1/2  ✅
multi_turn:              1/2  ✅
Total:                   21/24 (87.5%)
```

## 🔧 פיתוח

```bash
# Dev mode
npm run dev

# Build
npm run build

# Start with PM2 (auto-restart)
npx pm2 start dist/index.js --name limor

# View logs
npx pm2 logs limor

# Restart
npx pm2 restart limor
```

### CI/CD
- GitHub Actions: benchmarks רצים אוטומטית על כל push ל-main
- Pre-push script: `scripts/pre-push-benchmark.sh`

## 📝 License

MIT
