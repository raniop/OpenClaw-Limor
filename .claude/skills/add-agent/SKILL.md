---
name: add-agent
description: Step-by-step guide to add a new agent to Limor's agent system. Use when the user wants to create a new specialized agent for the bot.
user-invocable: true
argument-hint: "<agent name, role, and capabilities>"
---

# Add a New Agent to Limor

Limor has 11 specialized agents. Follow these steps to add a new one.

## Step 1: Understand the Agent
Parse $ARGUMENTS to determine:
- Agent name (Hebrew, e.g., "שירה")
- Emoji identifier
- Role description
- What tools it needs
- What model to use (usually `claude-sonnet-4-6`)

## Step 2: Check Existing Agents
Read `src/agents/agent-types.ts` to see all current agent IDs and avoid conflicts.
Read `souls/` directory to see existing agent configurations.

Current agents: michal, ronit, noa, yael, tal, maya, adi, hila, dana, boris, yuri.

## Step 3: Create Soul File
Create `souls/<agent-id>.json`:

```json
{
  "name": "שם הסוכן",
  "emoji": "🎯",
  "role": "תיאור התפקיד",
  "model": {
    "name": "claude-sonnet-4-6",
    "maxTokens": 2048
  },
  "systemPrompt": "אתה [שם] [אמוג'י], [תפקיד] של מערכת לימור.\n\nתפקידך: [מה הסוכן עושה]\n\n## כלים זמינים:\n- [tool1] — [מה עושה]\n- [tool2] — [מה עושה]\n\n## כללים חמורים:\n- ⛔ אסור להמציא מידע! דווח רק על מה שקיבלת מהכלים.\n- ⛔ אם אין לך מידע — אמור \"אין לי מידע על זה\".\n- כתוב בעברית, מקצועי וברור"
}
```

**maxTokens guidelines:**
- Simple response agents: 1024
- Research/analysis agents: 2048
- Coding/DevOps agents: 8192–32768

## Step 4: Register Agent Type
Add to `src/agents/agent-types.ts`:

```typescript
// Add new agent ID to the AgentId type/enum
// Add new agent config
```

## Step 5: Register in Agent Registry
Add to `src/agents/agent-registry.ts`:
- Load the soul file
- Map agent ID to tools array
- Register the agent config

## Step 6: Update Delegation Prompt
The main Limor system prompt needs to know about the new agent so she can delegate to it.
Check `src/ai/prompt-builder.ts` or `workspace/identity/SOUL.md` for the agent list and add the new agent.

## Step 7: Build and Test
```bash
npm run build
npm test
```

## Step 8: Update Documentation

1. **CLAUDE.md** — Add agent to the agent system table
2. **README.md** — Add to the agents table
3. **workspace/identity/CAPABILITIES_MAP.md** — If the agent adds new capabilities

## Checklist
- [ ] Soul file: `souls/<id>.json`
- [ ] Agent type registered in `src/agents/agent-types.ts`
- [ ] Agent registered in `src/agents/agent-registry.ts`
- [ ] Tools mapped to agent
- [ ] Delegation prompt updated (Limor knows about the agent)
- [ ] `npm run build` passes
- [ ] CLAUDE.md updated
- [ ] README.md updated
