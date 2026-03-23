## מה כבר קיים במערכת (אל תבני מחדש!)

### מערכת Ops / QA (src/ops/)
כבר נבנתה ומחוברת! כוללת:
- **Operational Trace** — לוג מובנה לכל הודעה עם 25+ שדות (intent, state, mood, focus, tools, outcome)
- **Self-Check** — 12 בדיקות בוליאניות אחרי כל תגובה (action_claimed_not_executed, tool_intended_not_used, open_loop_unaddressed, etc.)
- **Metrics** — 10 מדדים (tool precision/recall, hallucination rate, task completion, etc.)
- **Pass/Fail** — 4 gating metrics + 2 warning metrics
- **Dashboard API** — GET /api/ops עם traces, metrics, pass/fail, top failures

### Benchmark Suite (tests/scenarios/ + tests/benchmark/)
כבר נבנתה! 24 תרחישים ב-9 קטגוריות. להריץ: `npm run benchmark`

### Failure Modes (workspace/ops/failure-modes.json)
20 failure modes מתועדים עם symptoms, trace signals, mitigations.

### Context Engine (src/context/)
17 שכבות דטרמיניסטיות:
- Mood Detection (mood-detector.ts) — 7 מצבי רוח
- Correction Learner (correction-learner.ts) — למידה אוטומטית מתיקונים
- Response Mode עם register (casual/professional/relaxed) לפי שעה
- Multi-step Planning — זיהוי בקשות מורכבות

### Deep Memory (src/memory.ts)
- Facts + Preferences + Patterns + Emotional Log per user
- AI-based fact extraction with preference detection

### Proactive Messaging (src/proactive/)
- Followup reminders (כל 15 דק, פעם אחת per followup)
- Pre-meeting alerts (30 דק לפני)
- Morning summary (07:30)
- Rate limiter (max 3/day, quiet hours)

### חיפוש באינטרנט (src/web-search.ts)
- **web_search** — חיפוש באינטרנט עם Brave Search API (או DuckDuckGo כ-fallback). מחזיר 5 תוצאות עם כותרת, תקציר וקישור. תומך בשפות שונות (ברירת מחדל: עברית).

### מודלים ו-API
- **Claude Sonnet 4.6** — מודל ברירת מחדל (claude-sonnet-4-6). 1M context window, 64K max output.
- **Claude Opus 4.6** — למשימות מורכבות ו-capabilities (claude-opus-4-6). 1M context window, 128K max output.
- **Adaptive Thinking** — ב-4.6 Claude מחליט בעצמו מתי לחשוב לעומק (מחליף את Extended Thinking הישן).
- **Prompt Caching** — cache שעה (ttl: 3600) על system prompts יציבים — חוסך ~90% מעלויות קריאה.
- **1M Context GA** — חלון הקשר של מיליון טוקנים ללא תוספת מחיר (מרץ 2026).

### MCP (Model Context Protocol)
- סטנדרט פתוח תחת Linux Foundation (הועבר דצמבר 2025).
- מאפשר חיבור כלים חיצוניים ל-Claude בצורה סטנדרטית.
- 75+ connectors זמינים ב-directory הרשמי.

### כלל: לפני שבונים capability חדשה
1. תבדקי אם היכולת כבר קיימת ב-src/
2. אם כן — **אל תבני מחדש!** תשתמשי במה שיש
3. אם לא — תשתמשי ב-create_capability_request
