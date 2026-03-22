import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canUseTool, getRole } from "../src/permissions/permission-service";
import type { SenderContext } from "../src/ai/types";

const owner: SenderContext = { chatId: "owner@c.us", name: "רני", isOwner: true };
const approved: SenderContext = { chatId: "user@c.us", name: "יוסי", isOwner: false };
const group: SenderContext = { chatId: "group@g.us", name: "יוסי", isOwner: false };

describe("getRole", () => {
  it("returns owner for owner sender", () => {
    assert.strictEqual(getRole(owner), "owner");
  });

  it("returns approved_contact for non-owner personal", () => {
    assert.strictEqual(getRole(approved), "approved_contact");
  });

  it("returns group for group chatId", () => {
    assert.strictEqual(getRole(group), "group");
  });

  it("returns unknown for undefined sender", () => {
    assert.strictEqual(getRole(undefined), "unknown");
  });
});

describe("canUseTool", () => {
  it("owner can use all tools", () => {
    assert.strictEqual(canUseTool("send_message", owner), true);
    assert.strictEqual(canUseTool("crm_search_policy", owner), true);
    assert.strictEqual(canUseTool("smart_home_control", owner), true);
    assert.strictEqual(canUseTool("code_implement", owner), true);
    assert.strictEqual(canUseTool("gett_book_ride", owner), true);
  });

  it("non-owner cannot use owner-only tools", () => {
    assert.strictEqual(canUseTool("send_message", approved), false);
    assert.strictEqual(canUseTool("crm_search_policy", approved), false);
    assert.strictEqual(canUseTool("smart_home_control", approved), false);
    assert.strictEqual(canUseTool("code_implement", approved), false);
    assert.strictEqual(canUseTool("gett_book_ride", approved), false);
    assert.strictEqual(canUseTool("run_capability", approved), false);
  });

  it("non-owner can use universal tools", () => {
    // create_event and list_events are now owner-only
    assert.strictEqual(canUseTool("create_event", approved), false);
    assert.strictEqual(canUseTool("list_events", approved), false);
    // Travel and booking are universal (not in TOOL_PERMISSIONS)
    assert.strictEqual(canUseTool("flight_search", approved), true);
    assert.strictEqual(canUseTool("hotel_search", approved), true);
    assert.strictEqual(canUseTool("ontopo_search", approved), true);
    assert.strictEqual(canUseTool("request_meeting", approved), true);
  });

  it("CRM prefix matching works", () => {
    assert.strictEqual(canUseTool("crm_dashboard", approved), false);
    assert.strictEqual(canUseTool("crm_policy_details", approved), false);
    assert.strictEqual(canUseTool("crm_dashboard", owner), true);
  });

  it("group members cannot use owner tools", () => {
    assert.strictEqual(canUseTool("send_message", group), false);
    assert.strictEqual(canUseTool("list_contacts", group), false);
  });
});
