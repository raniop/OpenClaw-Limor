import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { withCircuitBreaker } from "../src/utils/circuit-breaker";

// Reset circuit state between tests by using unique names
let testCounter = 0;
function uniqueName(base: string): string {
  return `${base}-${++testCounter}`;
}

describe("circuit-breaker", () => {
  describe("withCircuitBreaker", () => {
    it("passes through successful calls", async () => {
      const opts = { name: uniqueName("ok"), failureThreshold: 3, cooldownMs: 1000 };
      const result = await withCircuitBreaker(opts, async () => "success", "fallback");
      assert.strictEqual(result, "success");
    });

    it("propagates errors when under threshold", async () => {
      const opts = { name: uniqueName("err"), failureThreshold: 3, cooldownMs: 1000 };
      await assert.rejects(
        () => withCircuitBreaker(opts, async () => { throw new Error("boom"); }, "fallback"),
        { message: "boom" }
      );
    });

    it("opens circuit after failureThreshold consecutive failures", async () => {
      const name = uniqueName("open");
      const opts = { name, failureThreshold: 2, cooldownMs: 60_000 };
      const fn = async () => { throw new Error("fail"); };

      // Fail twice to open circuit
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));

      // Third call should return fallback immediately (circuit open)
      const result = await withCircuitBreaker(opts, fn, "fallback");
      assert.strictEqual(result, "fallback");
    });

    it("returns fallback without calling fn when circuit is open", async () => {
      const name = uniqueName("nofn");
      const opts = { name, failureThreshold: 1, cooldownMs: 60_000 };
      let callCount = 0;
      const fn = async () => { callCount++; throw new Error("fail"); };

      // One failure opens the circuit
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      assert.strictEqual(callCount, 1);

      // Next call — fn should NOT be called
      const result = await withCircuitBreaker(opts, fn, "fallback");
      assert.strictEqual(result, "fallback");
      assert.strictEqual(callCount, 1); // still 1 — fn was not called
    });

    it("allows half-open attempt after cooldown expires", async () => {
      const name = uniqueName("half");
      const opts = { name, failureThreshold: 1, cooldownMs: 50 }; // 50ms cooldown

      // Open the circuit
      await assert.rejects(() =>
        withCircuitBreaker(opts, async () => { throw new Error("fail"); }, "fallback")
      );

      // Verify circuit is open
      const fallback = await withCircuitBreaker(opts, async () => "ok", "fallback");
      assert.strictEqual(fallback, "fallback");

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 100));

      // Now should allow through (half-open)
      const result = await withCircuitBreaker(opts, async () => "recovered", "fallback");
      assert.strictEqual(result, "recovered");
    });

    it("resets counter on success after half-open recovery", async () => {
      const name = uniqueName("reset");
      const opts = { name, failureThreshold: 1, cooldownMs: 50 };

      // Open circuit
      await assert.rejects(() =>
        withCircuitBreaker(opts, async () => { throw new Error("fail"); }, "fallback")
      );

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 100));

      // Recover
      await withCircuitBreaker(opts, async () => "ok", "fallback");

      // Should allow subsequent calls without fallback
      const result = await withCircuitBreaker(opts, async () => "still ok", "fallback");
      assert.strictEqual(result, "still ok");
    });

    it("re-opens circuit if half-open attempt fails", async () => {
      const name = uniqueName("reopen");
      const opts = { name, failureThreshold: 1, cooldownMs: 50 };

      // Open circuit
      await assert.rejects(() =>
        withCircuitBreaker(opts, async () => { throw new Error("fail1"); }, "fallback")
      );

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 100));

      // Half-open attempt fails
      await assert.rejects(() =>
        withCircuitBreaker(opts, async () => { throw new Error("fail2"); }, "fallback")
      );

      // Should be open again (no waiting for cooldown)
      const result = await withCircuitBreaker(opts, async () => "not called", "fallback");
      assert.strictEqual(result, "fallback");
    });

    it("successful call resets failure counter", async () => {
      const name = uniqueName("resetcnt");
      const opts = { name, failureThreshold: 3, cooldownMs: 60_000 };
      let shouldFail = true;

      const fn = async () => {
        if (shouldFail) throw new Error("fail");
        return "ok";
      };

      // Fail twice (under threshold)
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));

      // Succeed — should reset counter
      shouldFail = false;
      const result = await withCircuitBreaker(opts, fn, "fallback");
      assert.strictEqual(result, "ok");

      // Now fail twice more — circuit should NOT be open (counter was reset)
      shouldFail = true;
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));

      // Still under threshold — should try fn (not fallback)
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));

      // Now at threshold — next call should be fallback
      const fallback = await withCircuitBreaker(opts, fn, "fallback");
      assert.strictEqual(fallback, "fallback");
    });

    it("uses default threshold of 3 when not specified", async () => {
      const name = uniqueName("defaults");
      const opts = { name, cooldownMs: 60_000 };
      const fn = async () => { throw new Error("fail"); };

      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));
      await assert.rejects(() => withCircuitBreaker(opts, fn, "fallback"));

      // 4th call: circuit should be open
      const result = await withCircuitBreaker(opts, fn, "fallback");
      assert.strictEqual(result, "fallback");
    });
  });
});
