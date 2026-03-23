---
name: workspace-audit
description: Audit Limor's workspace files for completeness, consistency, and accuracy. Use when the user asks to review workspace, check policies, audit documentation, or verify workspace integrity.
user-invocable: true
---

# Workspace Audit

Comprehensive audit of Limor's workspace documentation and configuration.

## What to Check

### 1. Identity Files (`workspace/identity/`)
- [ ] `SOUL.md` — Does it match current capabilities? Are all tools mentioned?
- [ ] `VOICE.md` — Is the tone guide consistent with actual bot behavior?
- [ ] `OPERATING_PRINCIPLES.md` — Are iron rules up to date with code?
- [ ] `CAPABILITIES_MAP.md` — Does it list all current systems? Any missing?

### 2. Policy Files (`workspace/policies/`)
- [ ] `privacy.md` — Does it cover all sensitive data types?
- [ ] `groups.md` — Does SKIP/RESPOND logic match `group-classifier.ts`?
- [ ] `messaging.md` — Is the iron rule consistent with handler code?
- [ ] `booking.md` — Are both Ontopo and Tabit documented correctly?
- [ ] `calendar.md` — Does it match current calendar handler?
- [ ] `crm.md` — Are all CRM tools listed?
- [ ] `smarthome.md` — Are all rooms listed correctly?
- [ ] `multi_step.md` — Is the planning flow accurate?

### 3. Runbooks (`workspace/runbooks/`)
- [ ] Do runbook steps match actual tool names in `src/ai/tools/`?
- [ ] Are there missing runbooks for common workflows?

### 4. Integration Files (`workspace/integrations/`)
- [ ] Do documented parameters match actual tool definitions?
- [ ] Are there undocumented integrations in `src/ai/tools/` that need docs?

### 5. Agent System
- [ ] Do all `souls/*.json` files have valid JSON?
- [ ] Does the agent list in CLAUDE.md match `souls/` directory?
- [ ] Does README agent table match actual agents?

### 6. Cross-Reference
- [ ] Tools mentioned in policies exist in code
- [ ] Agents mentioned in docs exist in `souls/`
- [ ] Model names in docs match code (`claude-sonnet-4-6`, `claude-opus-4-6`)

## How to Work

1. Read all workspace files
2. Read relevant source files for cross-reference
3. Compare docs vs code
4. Report discrepancies

## Output Format

```
## Workspace Audit Results

### OK
- [list of files that pass]

### Issues Found
| File | Issue | Severity |
|------|-------|----------|
| file.md | description | High/Medium/Low |

### Missing Documentation
- [tools/agents/flows that lack docs]

### Recommendations
- [suggested improvements]
```

Do NOT modify any files. Only report findings. The user decides what to fix.
