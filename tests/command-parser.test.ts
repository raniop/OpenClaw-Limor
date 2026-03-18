import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOwnerCommand } from "../src/command-parser";

describe("parseOwnerCommand", () => {
  // --- Contact approval ---
  describe("approve_contact", () => {
    it("parses 'אשר CODE'", () => {
      const cmd = parseOwnerCommand("אשר A7F3K2");
      assert.deepStrictEqual(cmd, { type: "approve_contact", code: "A7F3K2" });
    });

    it("parses 'אשר קשר CODE'", () => {
      const cmd = parseOwnerCommand("אשר קשר B2X4P9");
      assert.deepStrictEqual(cmd, { type: "approve_contact", code: "B2X4P9" });
    });

    it("parses 'approve CODE' (English)", () => {
      const cmd = parseOwnerCommand("approve C3D5F7");
      assert.deepStrictEqual(cmd, { type: "approve_contact", code: "C3D5F7" });
    });

    it("is case-insensitive on code", () => {
      const cmd = parseOwnerCommand("אשר a7f3k2");
      assert.deepStrictEqual(cmd, { type: "approve_contact", code: "A7F3K2" });
    });

    it("rejects codes shorter than 4 chars", () => {
      const cmd = parseOwnerCommand("אשר AB");
      assert.strictEqual(cmd, null);
    });

    it("rejects codes longer than 8 chars", () => {
      const cmd = parseOwnerCommand("אשר ABCDEFGHJ");
      assert.strictEqual(cmd, null);
    });
  });

  // --- Contact rejection ---
  describe("reject_contact", () => {
    it("parses 'דחה CODE'", () => {
      const cmd = parseOwnerCommand("דחה A7F3K2");
      assert.deepStrictEqual(cmd, { type: "reject_contact", code: "A7F3K2" });
    });

    it("parses 'דחה קשר CODE'", () => {
      const cmd = parseOwnerCommand("דחה קשר B2X4P9");
      assert.deepStrictEqual(cmd, { type: "reject_contact", code: "B2X4P9" });
    });

    it("parses 'reject CODE' (English)", () => {
      const cmd = parseOwnerCommand("reject C3D5F7");
      assert.deepStrictEqual(cmd, { type: "reject_contact", code: "C3D5F7" });
    });
  });

  // --- Meeting approval ---
  describe("approve_meeting", () => {
    it("parses 'אשר פגישה MXXXXX'", () => {
      const cmd = parseOwnerCommand("אשר פגישה M4KP2N");
      assert.deepStrictEqual(cmd, { type: "approve_meeting", id: "M4KP2N" });
    });

    it("'אשר MXXXXX' without פגישה matches approve_contact (contact regex matches first)", () => {
      // M-prefixed codes match contact regex first — to approve a meeting, must use "אשר פגישה MXXXXX"
      const cmd = parseOwnerCommand("אשר M4KP2N");
      assert.strictEqual(cmd?.type, "approve_contact");
    });

    it("is case-insensitive on meeting ID", () => {
      const cmd = parseOwnerCommand("אשר פגישה m4kp2n");
      assert.deepStrictEqual(cmd, { type: "approve_meeting", id: "M4KP2N" });
    });

    it("does NOT match non-M-prefixed codes as meetings", () => {
      // "אשר A4KP2N" should be approve_contact, not approve_meeting
      const cmd = parseOwnerCommand("אשר A4KP2N");
      assert.strictEqual(cmd?.type, "approve_contact");
    });
  });

  // --- Meeting rejection ---
  describe("reject_meeting", () => {
    it("parses 'דחה פגישה MXXXXX'", () => {
      const cmd = parseOwnerCommand("דחה פגישה M4KP2N");
      assert.deepStrictEqual(cmd, { type: "reject_meeting", id: "M4KP2N" });
    });

    it("parses 'דחה MXXXXX' (without פגישה)", () => {
      const cmd = parseOwnerCommand("דחה M4KP2N");
      // This should be reject_contact since the regex for reject_contact matches first
      // and M4KP2N is 6 chars which is within 4-8 range
      // This is expected behavior — to reject a meeting, use "דחה פגישה MXXXXX"
      assert.strictEqual(cmd?.type, "reject_contact");
    });
  });

  // --- Bare approve ---
  describe("bare_approve", () => {
    it("parses 'כן'", () => {
      assert.deepStrictEqual(parseOwnerCommand("כן"), { type: "bare_approve" });
    });

    it("parses 'אשר' (without code)", () => {
      assert.deepStrictEqual(parseOwnerCommand("אשר"), { type: "bare_approve" });
    });

    it("parses 'yes'", () => {
      assert.deepStrictEqual(parseOwnerCommand("yes"), { type: "bare_approve" });
    });

    it("parses 'approve' (without code)", () => {
      assert.deepStrictEqual(parseOwnerCommand("approve"), { type: "bare_approve" });
    });

    it("parses 'אישור'", () => {
      assert.deepStrictEqual(parseOwnerCommand("אישור"), { type: "bare_approve" });
    });
  });

  // --- Non-commands ---
  describe("non-commands", () => {
    it("returns null for regular text", () => {
      assert.strictEqual(parseOwnerCommand("מה קורה"), null);
    });

    it("returns null for empty string", () => {
      assert.strictEqual(parseOwnerCommand(""), null);
    });

    it("bare 'אשר' is a bare_approve (already tested above)", () => {
      assert.deepStrictEqual(parseOwnerCommand("אשר"), { type: "bare_approve" });
    });

    it("returns null for code with special chars", () => {
      assert.strictEqual(parseOwnerCommand("אשר A@B#C$"), null);
    });

    it("handles whitespace around input", () => {
      const cmd = parseOwnerCommand("  אשר A7F3K2  ");
      assert.deepStrictEqual(cmd, { type: "approve_contact", code: "A7F3K2" });
    });
  });
});
