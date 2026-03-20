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

### כלל: לפני שבונים capability חדשה
1. תבדקי אם היכולת כבר קיימת ב-src/
2. אם כן — **אל תבני מחדש!** תשתמשי במה שיש
3. אם לא — תשתמשי ב-create_capability_request
