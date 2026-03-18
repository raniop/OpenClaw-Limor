import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTrace, elapsed, timeAsync, timeSync, startTimer, normalizeError } from "../src/observability";

describe("observability", () => {
  describe("createTrace", () => {
    it("generates unique trace IDs", () => {
      const t1 = createTrace({ chatId: "a@lid", contactName: "A", phone: "111", isGroup: false, isOwner: true });
      const t2 = createTrace({ chatId: "b@lid", contactName: "B", phone: "222", isGroup: true, isOwner: false });
      assert.notStrictEqual(t1.traceId, t2.traceId);
    });

    it("trace ID starts with t-", () => {
      const t = createTrace({ chatId: "a@lid", contactName: "A", phone: "111", isGroup: false, isOwner: false });
      assert.ok(t.traceId.startsWith("t-"));
    });

    it("preserves context fields", () => {
      const t = createTrace({ chatId: "chat@lid", contactName: "Yoni", phone: "972", isGroup: true, isOwner: false });
      assert.strictEqual(t.chatId, "chat@lid");
      assert.strictEqual(t.contactName, "Yoni");
      assert.strictEqual(t.isGroup, true);
      assert.strictEqual(t.isOwner, false);
    });

    it("startedAt is close to now", () => {
      const before = Date.now();
      const t = createTrace({ chatId: "a@lid", contactName: "A", phone: "111", isGroup: false, isOwner: false });
      assert.ok(t.startedAt >= before);
      assert.ok(t.startedAt <= Date.now());
    });
  });

  describe("elapsed", () => {
    it("returns non-negative duration", () => {
      const t = createTrace({ chatId: "a@lid", contactName: "A", phone: "111", isGroup: false, isOwner: false });
      const e = elapsed(t);
      assert.ok(e >= 0);
    });
  });

  describe("startTimer", () => {
    it("measures elapsed time", async () => {
      const timer = startTimer();
      await new Promise((r) => setTimeout(r, 20));
      const ms = timer.stop();
      assert.ok(ms >= 15, `Expected >= 15ms, got ${ms}`);
      assert.ok(ms < 200, `Expected < 200ms, got ${ms}`);
    });
  });

  describe("timeAsync", () => {
    it("returns result and duration", async () => {
      const { result, durationMs } = await timeAsync(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 42;
      });
      assert.strictEqual(result, 42);
      assert.ok(durationMs >= 5);
    });
  });

  describe("timeSync", () => {
    it("returns result and duration", () => {
      const { result, durationMs } = timeSync(() => "hello");
      assert.strictEqual(result, "hello");
      assert.ok(durationMs >= 0);
    });
  });

  describe("normalizeError", () => {
    it("normalizes Error instances", () => {
      const err = new TypeError("bad input");
      const normalized = normalizeError(err, "testOp", "t-123");
      assert.strictEqual(normalized.name, "TypeError");
      assert.strictEqual(normalized.message, "bad input");
      assert.strictEqual(normalized.operation, "testOp");
      assert.strictEqual(normalized.traceId, "t-123");
      assert.ok(normalized.stack);
    });

    it("normalizes string errors", () => {
      const normalized = normalizeError("oops", "testOp", "t-456");
      assert.strictEqual(normalized.name, "UnknownError");
      assert.strictEqual(normalized.message, "oops");
      assert.strictEqual(normalized.operation, "testOp");
    });

    it("normalizes null/undefined", () => {
      const normalized = normalizeError(null, "testOp", "t-789");
      assert.strictEqual(normalized.name, "UnknownError");
      assert.strictEqual(normalized.message, "null");
    });
  });
});
