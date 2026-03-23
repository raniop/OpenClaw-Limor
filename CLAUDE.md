# CLAUDE.md — Limor WhatsApp AI Bot

## Tech Stack
- **Runtime:** Node.js 20, TypeScript 5.x
- **AI:** Anthropic Claude API (Sonnet 4.6 default, Opus for capabilities)
- **Messaging:** whatsapp-web.js (Puppeteer-based)
- **Database:** SQLite (better-sqlite3) with WAL mode
- **Dashboard:** Next.js 14 (port 3848)
- **Process Manager:** PM2
- **Testing:** Node.js built-in test runner (`node --test`)

## Commands
```bash
npm run build          # TypeScript → dist/
npm test               # Run all tests (460+)
npx pm2 restart limor  # Restart bot (use pm2 delete + start for clean restart)
npx pm2 logs limor     # View logs
npx pm2 status         # Process status
cd dashboard && npx next build  # Rebuild dashboard
```

## Architecture

### Entry Point
`src/index.ts` → initializes WhatsApp client, starts all pollers and schedulers

### Core Flow
```
WhatsApp message → src/whatsapp/index.ts (routing)
  → src/ai/send-message.ts (AI call with tool loop)
    → src/ai/prompt-builder.ts (system prompt assembly)
    → src/ai/handle-tool-call.ts (tool dispatch)
    → src/ai/handlers/*.ts (tool implementations)
```

### Key Directories
```
src/
├── agents/          # Agent framework (registry, runner, types)
├── ai/              # AI core (send-message, prompt, tools, handlers)
│   ├── handlers/    # Tool handler implementations (calendar, contacts, agents...)
│   └── tools/       # Tool definitions for Claude API
├── context/         # 17-layer context engine (mood, intent, state)
├── ops/             # Operational traces, metrics, self-check, pass/fail
├── sms/             # SMS reader, delivery detection, SMS watcher
├── digest/          # Daily summaries and briefings
├── stores/          # SQLite stores (conversations, approvals, contacts)
├── whatsapp/        # Message handling, response handler, group logic
├── permissions/     # Permission service for tool access control
├── proactive/       # Proactive engine (followups, calendar, morning brief)
└── capabilities/    # Self-programming via Claude Code CLI

souls/               # Agent personality files (JSON) — limor, boris, yuri, etc.
workspace/
├── identity/        # Limor's identity and personality
├── policies/        # Behavioral policies (privacy, booking, messaging)
├── runbooks/        # Step-by-step procedures
├── memory/          # Learned facts and user preferences
└── state/           # SQLite DB + JSON state files
dashboard/           # Next.js control panel
tests/               # Unit tests
```

### Agent System (11 agents)
Limor delegates to specialized agents via `delegate_to_agent` tool:
- **מיכל 👁️** — Group summaries
- **רונית 🔍** — Web research
- **נועה 📊** — Data analysis
- **יעל ⚡** — Automations
- **טל 🛡️** — Security
- **מאיה 🏠** — Smart home
- **עדי 📅** — Calendar
- **הילה 🍽️** — Restaurants
- **דנה 🛒** — Shopping
- **בוריס 🔧** — DevOps/monitoring
- **יורי 💻** — Developer (edit code, build, deploy)

Agent definitions: `souls/*.json`
Agent runner: `src/agents/agent-runner.ts`

### Important Patterns
- **Tool loop:** max 15 iterations, 90s timeout
- **Hallucination guard:** Retry if AI claims action without tool_use
- **Model router:** Sonnet 4.6 default, routes by context
- **Prompt caching:** Enabled on system prompt blocks
- **SMS Watcher:** Polls macOS Messages DB every 10s, forwards HAREL/OPHIR to WhatsApp

## Coding Guidelines
- All source in TypeScript under `src/`
- Always run `npm run build` after changes — never use `tsc` directly
- Use `npx pm2 delete limor && npx pm2 start ecosystem.config.js` for clean restart
- Keep handler logic in `src/ai/handlers/` — one file per domain
- Tool definitions in `src/ai/tools/` — separate from handlers
- Agent souls in `souls/*.json` — model, tools, personality
- State files in `workspace/state/` — SQLite DB is primary, JSON for dashboard compat
- Hebrew is the primary language for user-facing strings
- Don't modify `.env` — it contains API keys

@workspace/policies/privacy.md
@workspace/policies/owner_interaction.md
@workspace/identity/personality.md
