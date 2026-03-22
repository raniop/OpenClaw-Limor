import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleToolCall } from "../src/ai/handle-tool-call";
import { allHandlers } from "../src/ai/handlers";
import type { SenderContext } from "../src/ai/types";

const owner: SenderContext = { chatId: "owner@c.us", name: "רני", isOwner: true };
const contact: SenderContext = { chatId: "user@c.us", name: "יוסי", isOwner: false };

describe("handleToolCall", () => {
  describe("permissions", () => {
    it("owner can call owner-only tools", async () => {
      // send_message is owner-only; mock the handler
      const original = allHandlers["send_message"];
      allHandlers["send_message"] = async () => "✅ נשלח";
      try {
        const result = await handleToolCall("send_message", { contact_name: "test", message: "hi" }, owner);
        assert.strictEqual(result, "✅ נשלח");
      } finally {
        allHandlers["send_message"] = original;
      }
    });

    it("non-owner is denied owner-only tools", async () => {
      const result = await handleToolCall("send_message", { contact_name: "test", message: "hi" }, contact);
      assert.ok(result.includes("אין לך הרשאה"));
    });

    it("non-owner can use universal tools", async () => {
      // ontopo_search is available to non-owners
      const original = allHandlers["ontopo_search"];
      allHandlers["ontopo_search"] = async () => "found results";
      try {
        const result = await handleToolCall("ontopo_search", { restaurant: "test" }, contact);
        assert.strictEqual(result, "found results");
      } finally {
        allHandlers["ontopo_search"] = original;
      }
    });
  });

  describe("dispatch", () => {
    it("returns 'פעולה לא מוכרת' for unknown tool", async () => {
      const result = await handleToolCall("nonexistent_tool_xyz", {}, owner);
      assert.strictEqual(result, "פעולה לא מוכרת");
    });

    it("catches handler errors and returns error message", async () => {
      const original = allHandlers["list_files"];
      allHandlers["list_files"] = async () => { throw new Error("disk full"); };
      try {
        const result = await handleToolCall("list_files", {}, owner);
        assert.strictEqual(result, "שגיאה: disk full");
      } finally {
        allHandlers["list_files"] = original;
      }
    });

    it("CRM tools work via dispatch map", async () => {
      const original = allHandlers["crm_search_policy"];
      allHandlers["crm_search_policy"] = async () => '{"policies": []}';
      try {
        const result = await handleToolCall("crm_search_policy", { person_id: "123" }, owner);
        assert.strictEqual(result, '{"policies": []}');
      } finally {
        allHandlers["crm_search_policy"] = original;
      }
    });

    it("CRM tools denied for non-owner", async () => {
      const result = await handleToolCall("crm_dashboard", { month: 1, year: 2025 }, contact);
      assert.ok(result.includes("אין לך הרשאה"));
    });
  });

  describe("request_meeting logic", () => {
    it("owner calling request_meeting gets error", async () => {
      const result = await handleToolCall("request_meeting", { topic: "test", preferred_time: "now" }, owner);
      assert.ok(result.includes("אתה הבעלים"));
    });

    it("contact calling create_event gets redirected", async () => {
      const result = await handleToolCall("create_event", {
        title: "test", start_date: "2025-01-01T10:00:00Z",
      }, contact);
      assert.ok(result.includes("רק רני"));
    });
  });
});
