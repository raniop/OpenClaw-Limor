# Tests

## Running

```bash
npm test
```

## Why `--test-concurrency=1`?

Tests that exercise pairing, meetings, conversations, and approvals share JSON state files under `workspace/state/`. Running them in parallel causes cross-test pollution. Serial execution adds ~2 seconds but guarantees correctness.

To enable parallel tests, state modules would need configurable paths or dependency injection — tracked as a future improvement.
