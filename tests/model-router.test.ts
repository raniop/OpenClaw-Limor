import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectModel } from "../src/ai/model-router";

const OPUS = "claude-opus-4-6";
const SONNET = "claude-sonnet-4-6";

describe("model-router", () => {
  describe("selectModel", () => {
    // Rule 4: Groups → Sonnet
    it("returns Sonnet for group messages", () => {
      const result = selectModel({
        isOwner: false, isGroup: true,
        turnIntent: "multi_step_request", toolIntentType: "calendar",
      });
      assert.strictEqual(result.model, SONNET);
      assert.match(result.reason, /group/);
    });

    it("returns Sonnet for owner messages in group", () => {
      const result = selectModel({
        isOwner: true, isGroup: true,
        turnIntent: "multi_step_request", toolIntentType: "calendar",
      });
      assert.strictEqual(result.model, SONNET);
      assert.match(result.reason, /group/);
    });

    // Rule 3: Non-owner → Sonnet
    it("returns Sonnet for non-owner contacts", () => {
      const result = selectModel({
        isOwner: false, isGroup: false,
        turnIntent: "multi_step_request", toolIntentType: "calendar",
      });
      assert.strictEqual(result.model, SONNET);
      assert.match(result.reason, /non-owner/);
    });

    // Cost optimization: Owner + complex requests now use Sonnet (not Opus)
    it("returns Sonnet for owner + multi_step_request (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "multi_step_request", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + reminder_request (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "reminder_request", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + action_request + calendar (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "calendar",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + action_request + booking (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "booking",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + action_request + crm (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "crm",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + action_request + messaging (cost optimization)", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "messaging",
      });
      assert.strictEqual(result.model, SONNET);
    });

    // Rule 1b edge case: action_request with non-tool-heavy type → Sonnet
    it("returns Sonnet for owner + action_request + non-tool-heavy type", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + action_request + unknown type", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "action_request", toolIntentType: "chitchat",
      });
      assert.strictEqual(result.model, SONNET);
    });

    // Rule 1c: Capability intent → Opus (regardless of turnIntent)
    it("returns Opus for owner + capability intent", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "question", toolIntentType: "capability",
      });
      assert.strictEqual(result.model, OPUS);
      assert.match(result.reason, /capability/);
    });

    // Rule 2: Owner + simple chat → Sonnet
    it("returns Sonnet for owner + greeting", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "greeting", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + question", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "question", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });

    it("returns Sonnet for owner + continuation", () => {
      const result = selectModel({
        isOwner: true, isGroup: false,
        turnIntent: "continuation", toolIntentType: "none",
      });
      assert.strictEqual(result.model, SONNET);
    });
  });
});
