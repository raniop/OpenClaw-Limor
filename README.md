# לימור 🐾 — WhatsApp AI Personal Assistant

עוזרת אישית חכמה לוואטסאפ, מבוססת Claude Sonnet 4.6 / Opus 4.6 (Anthropic). מבינה עברית ואנגלית, מנהלת יומן, מזמינה מסעדות, מחפשת טיסות, שולחת הודעות, זוכרת הכל — ויודעת ללמוד מטעויות.

> 👤 **מותאמת אישית לכל משתמש** — שם העוזרת, שם הבעלים, מין (לשון זכר/נקבה), בני משפחה ואינטגרציות הכל מוגדר דרך אשף התקנה שיוצר `workspace/owner.json`. אותו פרויקט משמש כל אחד שרוצה עוזר אישי משלו.

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
- 📱 **SMS** — קריאת הודעות, מעקב משלוחים, ו-**SMS Watcher** (העברת הודעות SMS לוואטסאפ בזמן אמת כל 10 שניות)
- 💻 **Self-Programming** — יורי (סוכן מפתח) יכול לערוך קוד, לבנות ולפרוס ישירות מוואטסאפ
- 📡 **טלגרם** — ניטור ערוצים (התרעות + חדשות) עם תמונות + **סיכום קבוצות** (gramjs Client API)
- 📧 **אימייל** — קריאת דוא"ל (iCloud IMAP)

### אוטומציות
- ⏰ **תזכורות יזומות** — followup reminders, התראות לפני פגישות
- 📊 **בריפינג יומי** — מה מחכה לך, מה פתוח, ימי הולדת
- 📋 **סיכומי שיחות** — executive briefing פעמיים ביום (14:00 + 23:00) עם prompt caching
- 🔄 **מעקב אוטומטי** — יצירת followups מתוך שיחות
- 📋 **Multi-Step Planning** — תוכניות רב-שלביות עם מעקב התקדמות לאורך שיחות

### למידה עצמית
- 🧠 **Memory That Evolves** — ניתוח לילי שמזהה דפוסי התנהגות ("נוטה להזמין ברגע האחרון", "מגיב מהר בלילה")
- 🔧 **Self-Debugging** — לומדת מכשלי כלים — כשכלי נכשל 3+ פעמים, מייצרת כלל מניעה אוטומטי
- 🧬 **Social Graph Learning** — ניתוח לילי של דפוסי תקשורת — מסיקה אוטומטית סוג קשר, סגנון, וחשיבות
- 🧩 **Capability Marketplace** — "תלמדי לעשות X" → spec → יורי מממש → deploy אוטומטי

### קבוצות WhatsApp
- 🎯 **Smart Group Pre-Filter** — פילטר דטרמיניסטי לפני AI call (חוסך עלות):
  - **MUST_RESPOND**: שם לימור מוזכר, reply להודעה שלה, slash command
  - **MUST_SKIP**: שולח הוא בוט, reply למישהו אחר, @mention לאדם אחר, thread בין אחרים
  - **LET_AI_DECIDE**: מקרים לא ברורים
- 🔇 **קבוצות מושתקות** — לימור שומרת היסטוריה אבל לא מגיבה (ניתן לסכם לפי בקשה)
- 🧵 **Thread Tracker** — מעקב מי מדבר עם מי, זיהוי שיחות פעילות

### אבטחה והרשאות
- 🔒 **אישור אנשי קשר** — רק מי שהבעלים אישר יכול לדבר
- 🛡️ **הפרדת הרשאות** — יומן, CRM, קבצים = רק בעלים
- 📅 **State Machine לפגישות** — בקשה → אישור → יצירה (אטומי בקוד)
- ⚠️ **Social engineering protection** — התראה כשמישהו טוען "רני ביקש"

### אמינות ועמידות
- 🔌 **Circuit Breaker** — כל API חיצוני מוגן (3 כשלונות → 5 דקות cooldown)
- 🔄 **Tool Loop Safety** — מקסימום 15 iterations + timeout 90 שניות
- 💾 **SQLite Storage** — conversations + approvals ב-SQLite עם WAL mode
- 🔀 **Auto-migration** — מעבר חלק מ-JSON ל-SQLite בעלייה ראשונה

### QA ומוניטורינג
- 🔬 **Operational Trace** — 25+ שדות לכל הודעה
- ✅ **Self-Check** — 12 בדיקות בוליאניות אחרי כל תגובה
- 📈 **Metrics** — tool precision, hallucination rate, task completion
- 🧪 **460 Unit Tests** — send-message, tool dispatch, circuit breaker, model router, context engine
- 🚦 **Pass/Fail Framework** — gating metrics + warnings
- 📊 **Dashboard** — מרכז בקרה עם לוגים, metrics, alerts

### 🏢 מערכת סוכנים — "המשרד של לימור"
לימור מנהלת צוות של 13 סוכנים מתמחים, כל אחד עם אישיות וכלים ייחודיים:

| סוכן/ת | תפקיד | כלים |
|---------|--------|------|
| מיכל 👁️ | סיכום קבוצות WhatsApp + Telegram | `get_group_history`, `summarize_group_activity`, `telegram_summary`, `list_telegram_groups` |
| רונית 🔍 | מחקר אינטרנט עם מקורות | `web_search` |
| נועה 📊 | ניתוח נתונים וסטטיסטיקות | `list_events`, `read_sms`, `list_contacts` |
| יעל ⚡ | אוטומציות ותזכורות | `create_reminder`, `learn_instruction` |
| טל 🛡️ | אבטחה — ספאם ו-phishing | `web_search` |
| מאיה 🏠 | בית חכם — Control4 | `smart_home_control`, `smart_home_status`, `smart_home_list` |
| עדי 📅 | ניהול יומן ופגישות | `create_event`, `delete_event`, `list_events` |
| הילה 🍽️ | מסעדות ובילויים | `book_tabit`, `book_ontopo`, `web_search` |
| דנה 🛒 | קניות והשוואת מחירים | `web_search` |
| בוריס 🔧 | DevOps ובקרת מערכת | `system_health_check`, `get_error_logs`, `get_agent_stats` |
| יורי 💻 | מפתח — עריכת קוד, build ו-deploy | `read_file_source`, `edit_file`, `npm_manage`, `restart_and_deploy`, `run_command` |
| נמרוד 🔐 | סייבר — ניטור איומים, סריקת מערכת | `nimrod_run_scan`, `nimrod_scan_processes`, `nimrod_scan_persistence`, `nimrod_scan_network`, `nimrod_scan_filesystem`, `nimrod_scan_permissions`, `nimrod_get_alerts` |
| עמית 📦 | עדכון dependencies — בדיקה יומית | `npm_manage`, `edit_file`, `restart_and_deploy`, `run_command` |

- **Delegation אוטומטי** — לימור מזהה את הבקשה ומעבירה לסוכן המתאים
- **Async Delegation** — סוכנים ארוכים (יורי, נמרוד) רצים ברקע, לימור חופשיה לענות על הודעות אחרות
- **הודעת ביניים** — "הילה 🍽️ מחפשת לך משהו טוב..." בזמן שהסוכן עובד
- **Anti-hallucination** — סוכנים לא יכולים להמציא, רק לדווח מה הכלים החזירו

### אינטליגנציה
- 🧠 **17-Layer Context Engine** — הבנת הקשר דטרמיניסטית
- 📚 **Topic Segments** — "פרקי שיחה" מובנים שנשמרים ב-SQLite וניתנים לחיפוש ("זוכרת שדיברנו על...?")
- 🎯 **Smart History Selection** — בחירת 60 הודעות רלוונטיות מתוך 200 (חיסכון tokens + תשובות ממוקדות)
- 📋 **Structured Summaries** — סיכומי שיחה מובנים (JSON) שמשמרים שמות, תאריכים והחלטות
- 🔄 **Persistent State** — מצב שיחה שורד restart (SQLite) + שחזור הקשר אוטומטי
- 😊 **Mood Detection** — 7 מצבי רוח, התאמת טון
- 🔀 **Smart Model Router** — Sonnet 4.6 כברירת מחדל, Opus 4.6 רק ל-capability (אופטימיזציית עלויות)
- 🧠 **1M Context Window** — חלון הקשר של מיליון טוקנים (GA, ללא תוספת מחיר)
- 💰 **Prompt Caching** — cache שעה על system prompts יציבים (חיסכון ~90% בקריאה)
- 🔁 **Tool Retry** — ניסיון שני אוטומטי על כשל
- 🚫 **Anti-Hallucination** — כללי ברזל + retry אוטומטי על סוכנים וכלים

## 🚀 התקנה

### דרישות מערכת

| דרישה | macOS | Windows | הערה |
|-------|-------|---------|------|
| **Node.js 20+** | ✅ | ✅ | [nodejs.org](https://nodejs.org) |
| **npm** | ✅ (כלול) | ✅ (כלול) | |
| **Anthropic API Key** | ✅ | ✅ | [console.anthropic.com](https://console.anthropic.com) |
| **WhatsApp** | ✅ | ✅ | חשבון WhatsApp פעיל |
| **SMS features** | ✅ macOS בלבד | ❌ | דורש Full Disk Access |

### התקנה מהירה (3 דקות)

עובד אותו דבר על macOS ו-Windows:

```bash
# 1. Clone
git clone https://github.com/raniop/OpenClaw-Limor.git
cd OpenClaw-Limor

# 2. Dependencies (bot + dashboard)
npm run install-all

# 3. Setup wizard — שם, טלפון, API key → יוצר .env
npm run setup

# 4. Build
npm run build

# 5. Verify — בודק שהכל מוגדר נכון
npm run verify

# 6. Run
npx pm2 start ecosystem.config.js

# 7. Scan QR — פתח WhatsApp → Linked Devices → Scan QR from terminal
```

### Quick Launchers — הפעלה בדאבל-קליק

| Platform | File | מה עושה |
|----------|------|---------|
| **macOS** | `Start Limor.command` | Build + PM2 + Dashboard + פותח דפדפן |
| **Windows** | `Start Limor.bat` | Build + PM2 + Dashboard + פותח דפדפן |

### מציאת OWNER_CHAT_ID

אחרי ההפעלה הראשונה, צריך לזהות את ה-Chat ID שלך:

1. הפעל את הבוט: `npx pm2 start ecosystem.config.js`
2. שלח הודעה כלשהי לבוט בוואטסאפ
3. בדוק בלוגים: `npx pm2 logs`
4. חפש שורה כזו: `[chat] from: XXXXXXXXX@c.us`
5. העתק את ה-ID לקובץ `.env`: `OWNER_CHAT_ID=XXXXXXXXX@c.us`
6. הפעל מחדש: `npx pm2 restart limor`

### מה ה-Setup Wizard שואל?
1. **שם העוזרת** — איך היא תיקרא (ברירת מחדל: לימור). כל אחד בוחר שם משלו.
2. **פרטי הבעלים** — שם פרטי + מלא, **מין** (זכר/נקבה — משפיע על לשון פנייה בעברית), טלפון, אימייל
3. **בני משפחה** (אופציונלי) — שם, קשר (אבא/אמא/בן-זוג...), והאם יש להם הרשאות מתקדמות (גישה ל-CRM למשל)
4. **Anthropic API Key** — חובה (sk-ant-...)
5. **אינטגרציות (opt-in)** — Apple Calendar, iMessage, SMS watcher, Self-Programming, Google Calendar, CRM, Control4, Gett
6. **SMS Watchers** — שולחי SMS לעקוב (HAREL, AMEX, bit, וכו') — לכל אחד: שם, תווית, אימוג'י
7. **שירותים חיצוניים** — SMTP, Brave Search, CRM, Har HaBituach, Control4, Gett — רק מה שהפעלת

ה-wizard יוצר:
- `workspace/owner.json` — מקור אמת יחיד לזהות הבעלים, משפחה, ואינטגרציות (gitignored — אישי!)
- `.env` — API keys וסודות
- `souls/[botname].json` — אישיות העוזרת (עם placeholders שמתרנדרים מ-owner.json)

אם קיים `workspace/memory/` מהתקנה קודמת, האשף **מגבה אותו אוטומטית** ל-`workspace/memory.backup-[timestamp]/` כדי שלא תתערבב זהות אישית בין משתמשים.

## 🔄 עדכון / Updating

```bash
npm run update            # מרענן dependencies + build
npm run update:baileys    # משדרג את ספריית WhatsApp (Baileys) לגרסה האחרונה מ-npm
```

הבוט בודק אוטומטית פעם ביום אם יצאה גרסה חדשה של Baileys, ושולח הודעה בוואטסאפ. הקוד עצמו self-hosted — אתה שולט מתי לעדכן.

## ⚙️ הגדרות

### `workspace/owner.json` (עיקרי — personal data)

| שדה | תיאור |
|-----|-------|
| `name`, `fullName`, `nameEn` | שמות הבעלים |
| `gender` | `"male"` / `"female"` — משפיע על לשון זכר/נקבה בעברית |
| `phone`, `email`, `chatId` | פרטי קשר |
| `family[]` | בני משפחה עם `name`, `relation`, `hasPrivilegedAccess` |
| `assistant.name`, `assistant.nameEn` | שם העוזרת |
| `integrations.{appleCalendar, sms, iMessage, capabilities, googleCalendar, control4, gett, crm}` | feature flags opt-in |
| `smsWatchedSenders[]` | שולחי SMS שמועברים ל-WhatsApp — `{sender, label, emoji, keywords?, excludeKeywords?}` |
| `crmLabel` | תיאור CRM (למשל "ביטוח אופיר") |

### `.env` (סודות בלבד)

| משתנה | חובה | תיאור |
|-------|------|--------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key |
| `OPENAI_API_KEY` | אופציונלי | Voice transcription |
| `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` | אופציונלי | Google Calendar |
| `BRAVE_SEARCH_API_KEY` | אופציונלי | חיפוש אינטרנט (fallback: DuckDuckGo) |
| `RAPIDAPI_KEY` | אופציונלי | טיסות ומלונות |
| `CRM_API_URL/USERNAME/PASSWORD` | אופציונלי | CRM server |
| `HARB_ID_NUMBER/PASSWORD` | אופציונלי | הר הביטוח |
| `SMTP_EMAIL/PASSWORD` | אופציונלי | שליחת מיילים |
| `ICLOUD_IMAP_EMAIL/PASSWORD` | אופציונלי | קריאת מיילים |
| `CONTROL4_*` | אופציונלי | בית חכם |
| `GETT_*` | אופציונלי | מונית |
| `TELEGRAM_API_ID/HASH/PHONE` | אופציונלי | Telegram (מ-my.telegram.org) |
| `HEALTH_DAILY_CALORIE_GOAL` | אופציונלי | יעד קלוריות יומי |

## 🏗️ ארכיטקטורה

```
src/
├── ai/                    # Claude API, tools, model router
│   ├── send-message.ts    # Core message loop + hallucination guard + safety limits
│   ├── handle-tool-call.ts # Dispatch map (was 858-line if/else, now 33 lines)
│   ├── handlers/          # Tool handlers by domain (calendar, booking, crm, etc.)
│   ├── model-router.ts    # Smart Opus/Sonnet routing
│   ├── tools/             # 75+ tool definitions
│   └── extract-facts.ts   # Background memory extraction
├── stores/                # Storage layer (SQLite + migration)
│   ├── sqlite-init.ts     # Database init, WAL mode, schema
│   ├── sqlite-approval-store.ts  # Approved contacts (SQLite)
│   ├── sqlite-conversation-store.ts # Conversations (SQLite)
│   └── index.ts           # Store provider + JSON→SQLite migration
├── utils/                 # Shared utilities
│   └── circuit-breaker.ts # Generic circuit breaker for external APIs
├── context/               # 17-layer context engine
│   ├── mood-detector.ts   # Emotional state detection
│   ├── turn-intent.ts     # Intent classification
│   ├── response-mode.ts   # Tone/brevity adaptation
│   ├── history-selector.ts # Smart history selection (top 60 of 200)
│   ├── topic-segmenter.ts # Extract conversation chapters on rotation
│   ├── topic-retriever.ts # Find relevant past segments for context
│   ├── correction-learner.ts # Learn from user corrections
│   └── ...                # 14 more resolver layers
├── whatsapp/              # WhatsApp client + handlers
│   ├── index.ts           # Message routing + PM2
│   ├── group-classifier.ts # Smart pre-filter (MUST_RESPOND/SKIP/AI)
│   ├── thread-tracker.ts  # Conversation flow tracking
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
├── insights/              # Nightly intelligence
│   ├── insight-scheduler.ts      # Behavioral pattern analysis (02:00)
│   └── social-graph-analyzer.ts  # Relationship inference (02:30)
├── digest/                # Daily briefings
│   ├── digest-service.ts  # Morning briefing
│   └── daily-summaries.ts # Executive briefings
├── telegram/              # Channel monitoring + group reading
│   ├── alert-poller.ts    # Scraping + images + circuit breaker
│   └── client.ts          # gramjs Client API — read group messages
├── memory.ts              # Deep memory (facts, preferences, patterns, emotional log)
├── conversation.ts        # History + rolling summary + rotation (SQLite-backed)
├── web-search.ts          # Internet search (circuit breaker protected)
├── calendar.ts            # Google Calendar API (circuit breaker protected)
├── ontopo.ts / tabit.ts   # Restaurant booking (circuit breaker protected)
├── flights.ts / hotels.ts # Travel search (circuit breaker protected)
├── crm.ts                 # CRM API (circuit breaker protected)
└── gett.ts                # Taxi booking (circuit breaker protected)

workspace/
├── owner.json             # ⭐ Source of truth for identity + integrations (gitignored)
├── owner.json.example     # Template for new installs
├── identity/              # Assistant personality (templates — rendered via owner.json)
│   ├── SOUL.md            # Who the assistant is
│   ├── VOICE.md           # How she talks
│   ├── OPERATING_PRINCIPLES.md # Iron rules
│   └── CAPABILITIES_MAP.md # What she knows she can do
├── policies/              # Behavioral policies (templated)
│   ├── calendar.md        # Meeting flow rules
│   ├── messaging.md       # Message sending rules
│   ├── privacy.md         # Access control rules
│   └── ...                # 8 more policies
└── state/                 # Runtime state (auto-created, gitignored)
    └── limor.db           # SQLite database (conversations, approvals)

# Owner personalization layer
src/owner-config.ts        # Loads + types workspace/owner.json
src/owner-template.ts      # Renders {{owner.name}}, {{assistant.name}}, pronouns
src/ai/action-claim-pattern.ts # Dynamic hallucination regex (owner-aware)

dashboard/                 # Next.js control panel
├── app/
│   ├── page.tsx           # Main dashboard
│   ├── ops/               # Operations & QA
│   ├── summaries/         # Daily conversation summaries
│   ├── followups/         # Task tracking
│   ├── contacts/          # Contact management
│   └── telegram/          # Monitored channels

tests/                     # 460 tests, 0 failures
├── send-message.test.ts   # Tool loop, hallucination guard, timeout
├── handle-tool-call.test.ts # Dispatch, permissions, error handling
├── circuit-breaker.test.ts # Circuit breaker state machine
├── model-router.test.ts   # Opus/Sonnet routing rules
├── context.test.ts        # 17-layer context engine tests
├── scenarios/             # 24 benchmark scenarios (9 categories)
└── benchmark/             # Automated benchmark runner

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
