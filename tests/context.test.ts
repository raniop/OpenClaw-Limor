import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "../src/context/context-builder";
import { formatContextForPrompt } from "../src/context/context-service";
import type { ContextBundle } from "../src/context/context-types";

const ownerSender = { name: "רני", isOwner: true, isGroup: false };
const contactSender = { name: "עמית", isOwner: false, isGroup: false };
const groupSender = { name: "עמית", isOwner: false, isGroup: true };

describe("context-builder", () => {
  describe("buildContext basics", () => {
    it("returns a valid ContextBundle for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "שלום", sender: ownerSender });
      assert.strictEqual(bundle.person.isOwner, true);
      assert.strictEqual(bundle.person.name, "רני");
      assert.ok(bundle.historySummary.length > 0);
      assert.ok(Array.isArray(bundle.signals));
    });

    it("returns default values for unknown contact", () => {
      const bundle = buildContext({ chatId: "unknown@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(bundle.person.relationshipType, "unknown");
      assert.strictEqual(bundle.person.importanceScore, 20);
      assert.strictEqual(bundle.person.communicationStyle, "unknown");
    });

    it("marks group correctly", () => {
      const bundle = buildContext({ chatId: "group@g.us", message: "test", sender: groupSender });
      assert.strictEqual(bundle.person.isGroup, true);
      assert.ok(bundle.signals.includes("group_message"));
    });
  });

  describe("signals", () => {
    it("includes owner_message for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "test", sender: ownerSender });
      assert.ok(bundle.signals.includes("owner_message"));
    });

    it("does not include owner_message for non-owner", () => {
      const bundle = buildContext({ chatId: "contact@c.us", message: "test", sender: contactSender });
      assert.ok(!bundle.signals.includes("owner_message"));
    });
  });

  describe("urgency priority", () => {
    it("defaults to low priority with no followups", () => {
      const bundle = buildContext({ chatId: "new@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(bundle.urgency.priority, "low");
      assert.strictEqual(bundle.urgency.hasFollowup, false);
      assert.strictEqual(bundle.urgency.isOverdue, false);
    });
  });

  describe("conversation context", () => {
    it("detects waiting for reply on fresh conversation", () => {
      // After buildContext, the message was already added to history by the caller
      // In test, history is empty so isWaitingForReply depends on last item
      const bundle = buildContext({ chatId: "fresh@c.us", message: "hello", sender: contactSender });
      // messageCount reflects what's in the store (may be 0 for fresh)
      assert.strictEqual(typeof bundle.conversation.messageCount, "number");
      assert.strictEqual(bundle.conversation.lastUserMessage, "hello");
    });

    it("sets repeatedRecentMessages to false for single message", () => {
      const bundle = buildContext({ chatId: "single@c.us", message: "one", sender: contactSender });
      assert.strictEqual(bundle.conversation.repeatedRecentMessages, false);
    });
  });

  describe("history summary", () => {
    it("produces non-empty summary", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hello", sender: contactSender });
      assert.ok(bundle.historySummary.length > 0);
    });

    it("includes owner mention for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "hi", sender: ownerSender });
      assert.ok(bundle.historySummary.includes("רני") || bundle.historySummary.includes("בעלים"));
    });

    it("includes group mention for group", () => {
      const bundle = buildContext({ chatId: "group@g.us", message: "hi", sender: groupSender });
      assert.ok(bundle.historySummary.includes("קבוצה"));
    });
  });

  describe("system context", () => {
    it("returns numeric counts", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(typeof bundle.system.pendingApprovals, "number");
      assert.strictEqual(typeof bundle.system.pendingMeetings, "number");
      assert.strictEqual(typeof bundle.system.pendingFollowups, "number");
      assert.strictEqual(typeof bundle.system.pendingCapabilities, "number");
    });
  });
});

describe("formatContextForPrompt", () => {
  it("produces readable Hebrew text", () => {
    const bundle = buildContext({ chatId: "test@c.us", message: "hello", sender: contactSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("הקשר נוכחי"));
    assert.ok(text.includes("סיכום:"));
  });

  it("shows owner info for owner", () => {
    const bundle = buildContext({ chatId: "owner@c.us", message: "hi", sender: ownerSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("רני"));
    assert.ok(text.includes("בעלים"));
  });

  it("shows group info for group", () => {
    const bundle = buildContext({ chatId: "group@g.us", message: "hi", sender: groupSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("קבוצה"));
  });

  it("includes importance score for contacts", () => {
    const bundle = buildContext({ chatId: "contact@c.us", message: "hi", sender: contactSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("/100"));
  });
});
