import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { statePath, getStateDir } from "../src/state-dir";

// Ensure the test state directory exists
const stateDir = getStateDir();
if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

// Reset state files before each test
function resetState() {
  writeFileSync(statePath("approved.json"), "[]", "utf-8");
  writeFileSync(statePath("pending.json"), "{}", "utf-8");
}

// Import after state dir exists
import {
  isApproved,
  addApproved,
  removeApproved,
  isPending,
  addPending,
  approveByCode,
  rejectByCode,
  getLastPending,
  getPendingCount,
} from "../src/pairing";

describe("pairing", () => {
  beforeEach(() => resetState());

  describe("addPending", () => {
    it("returns a code string", () => {
      const code = addPending("chat1@lid", "+972501234567");
      assert.ok(typeof code === "string");
      assert.ok(code.length >= 4);
    });

    it("returns the same code for duplicate chatId", () => {
      const code1 = addPending("chat1@lid", "+972501234567");
      const code2 = addPending("chat1@lid", "+972501234567");
      assert.strictEqual(code1, code2);
    });

    it("returns different codes for different chatIds", () => {
      const code1 = addPending("chat1@lid", "+972501234567");
      const code2 = addPending("chat2@lid", "+972507654321");
      assert.notStrictEqual(code1, code2);
    });

    it("marks chatId as pending", () => {
      addPending("chat1@lid", "+972501234567");
      assert.ok(isPending("chat1@lid"));
    });
  });

  describe("approveByCode", () => {
    it("approves a pending contact", () => {
      const code = addPending("chat1@lid", "+972501234567");
      const entry = approveByCode(code);
      assert.ok(entry);
      assert.strictEqual(entry!.chatId, "chat1@lid");
      assert.ok(isApproved("chat1@lid"));
      assert.ok(!isPending("chat1@lid"));
    });

    it("returns null for invalid code", () => {
      const entry = approveByCode("ZZZZZZ");
      assert.strictEqual(entry, null);
    });

    it("is case-insensitive", () => {
      const code = addPending("chat1@lid", "+972501234567");
      const entry = approveByCode(code.toLowerCase());
      assert.ok(entry);
    });
  });

  describe("rejectByCode", () => {
    it("removes pending without approving", () => {
      const code = addPending("chat1@lid", "+972501234567");
      const entry = rejectByCode(code);
      assert.ok(entry);
      assert.strictEqual(entry!.chatId, "chat1@lid");
      assert.ok(!isPending("chat1@lid"));
      assert.ok(!isApproved("chat1@lid"));
    });

    it("returns null for invalid code", () => {
      assert.strictEqual(rejectByCode("ZZZZZZ"), null);
    });
  });

  describe("race condition protection", () => {
    it("two contacts pending — getPendingCount returns 2", () => {
      addPending("chat1@lid", "+972501111111");
      addPending("chat2@lid", "+972502222222");
      assert.strictEqual(getPendingCount(), 2);
    });

    it("two contacts pending — each has a unique code", () => {
      const code1 = addPending("chat1@lid", "+972501111111");
      const code2 = addPending("chat2@lid", "+972502222222");
      assert.notStrictEqual(code1, code2);
    });

    it("approving one does not approve the other", () => {
      const code1 = addPending("chat1@lid", "+972501111111");
      addPending("chat2@lid", "+972502222222");

      approveByCode(code1);
      assert.ok(isApproved("chat1@lid"));
      assert.ok(!isApproved("chat2@lid"));
      assert.ok(isPending("chat2@lid"));
    });
  });

  describe("getLastPending", () => {
    it("returns null when empty", () => {
      assert.strictEqual(getLastPending(), null);
    });

    it("returns entry with code", () => {
      const code = addPending("chat1@lid", "+972501234567");
      const last = getLastPending();
      assert.ok(last);
      assert.strictEqual(last!.code, code);
      assert.strictEqual(last!.chatId, "chat1@lid");
    });
  });

  describe("removeApproved", () => {
    it("removes an approved contact", () => {
      addApproved("chat1@lid");
      assert.ok(isApproved("chat1@lid"));
      assert.ok(removeApproved("chat1@lid"));
      assert.ok(!isApproved("chat1@lid"));
    });

    it("returns false for non-approved", () => {
      assert.ok(!removeApproved("chat_nonexistent@lid"));
    });
  });

  describe("persistence", () => {
    it("approved contact survives re-read", () => {
      const code = addPending("persist@lid", "+972500000000");
      approveByCode(code);
      assert.ok(isApproved("persist@lid"));
      // pairing.ts reads from file on every call, so this simulates a restart
      assert.ok(isApproved("persist@lid"), "contact should still be approved after re-read");
    });

    it("uses consistent key format (chatId as-is, no normalization)", () => {
      const chatId = "12345678@lid";
      addApproved(chatId);
      assert.ok(isApproved(chatId));
      assert.ok(!isApproved("12345678"));
      assert.ok(!isApproved("12345678@c.us"));
    });
  });
});
