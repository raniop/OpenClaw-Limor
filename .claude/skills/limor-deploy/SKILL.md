---
name: limor-deploy
description: Safe deployment pipeline for Limor WhatsApp bot. Runs build, tests, and PM2 restart with verification. Use when the user says "deploy", "push to production", "restart limor", or "פרסי".
user-invocable: true
argument-hint: "[--skip-tests] [--force]"
---

# Limor Safe Deploy

Deploy Limor with safety checks. Every step must pass before proceeding to the next.

## Pre-flight Checks

### 1. Git Status
```bash
cd /Users/raniophir/Open\ Claude\ Bot\ AI
git status --short
git log --oneline -3
```
- Warn if there are uncommitted changes
- Show last 3 commits for context
- If uncommitted changes and no `--force` flag: **STOP and ask user**

### 2. Build
```bash
npm run build 2>&1
```
- If build fails: **STOP** — report errors, do not proceed
- Count 0 errors = proceed

### 3. Tests (skip with --skip-tests)
```bash
npm test 2>&1
```
- If any tests fail: **STOP** — report failures, do not proceed
- Report pass count

### 4. Deploy
```bash
npx pm2 delete limor 2>/dev/null; npx pm2 start ecosystem.config.js
```

### 5. Verify
Wait 5 seconds, then:
```bash
npx pm2 status
npx pm2 logs limor --lines 10 --nostream
```
- Check PM2 shows "online" status
- Check logs for startup errors
- If status is "errored" or "stopped": **ALERT** — show logs

## Output Format

```
## Deploy Results

| Step | Status | Details |
|------|--------|---------|
| Git | OK/WARN | branch, uncommitted |
| Build | OK/FAIL | errors |
| Tests | OK/FAIL/SKIP | pass/fail |
| PM2 Restart | OK/FAIL | status |
| Verification | OK/FAIL | startup logs |

## Result: DEPLOYED / FAILED
[Details if failed]
```

## Safety Rules
- **NEVER** deploy if build fails
- **NEVER** deploy if tests fail (unless --skip-tests)
- **NEVER** modify .env
- **ALWAYS** use `pm2 delete + start` (not just restart) for clean state
- **ALWAYS** verify PM2 status after restart
