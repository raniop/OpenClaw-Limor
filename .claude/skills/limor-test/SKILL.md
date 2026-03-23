---
name: limor-test
description: Run Limor's full test suite — build, unit tests, and benchmarks. Use when the user says "test", "run tests", "check tests", "QA", or "verify".
user-invocable: true
argument-hint: "[quick|full|benchmark]"
---

# Limor Test Suite

Run the appropriate test level based on $ARGUMENTS (default: quick).

## Quick (default)
Fast verification — build + unit tests only.

```bash
cd /Users/raniophir/Open\ Claude\ Bot\ AI
npm run build 2>&1
npm test 2>&1
```

Report:
- Build status (pass/fail + error count)
- Test results (pass/fail/total)
- List any failing test names

## Full
Build + unit tests + type checking.

```bash
cd /Users/raniophir/Open\ Claude\ Bot\ AI
npm run build 2>&1
npm test 2>&1
```

Additionally:
- Check for TypeScript `any` usage in recently changed files
- Verify all handler exports match allHandlers registration
- Check that all soul JSON files are valid JSON

## Benchmark
Run the benchmark suite (24 scenarios).

```bash
cd /Users/raniophir/Open\ Claude\ Bot\ AI
npm run build 2>&1
npm run benchmark 2>&1
```

Report benchmark results per category.

## Output Format

```
## Limor Test Results — [quick/full/benchmark]

| Check | Result |
|-------|--------|
| Build | OK (0 errors) / FAIL (N errors) |
| Tests | 460/460 pass / N failures |
| Benchmark | 21/24 (87.5%) — if run |

### Failures (if any)
- test-name: error description

### Verdict: PASS / FAIL
```

If all tests pass, keep output short. Only elaborate on failures.
