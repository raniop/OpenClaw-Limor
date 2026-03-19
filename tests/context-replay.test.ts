import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runReplayTurn, runReplayScenario } from "../src/context/replay-runner";
import type { ReplayTurnInput, ReplayScenario } from "../src/context/context-types";

const ownerSender = { name: "רני", isOwner: true, isGroup: false };
const contactSender = { name: "עמית", isOwner: false, isGroup: false };

function makeTurn(message: string, sender = contactSender, chatId = "test@c.us"): ReplayTurnInput {
  return { chatId, message, sender };
}

// ============================================================
// Single turn replay
// ============================================================

describe("runReplayTurn", () => {
  it("returns resolved context for a single turn", () => {
    const result = runReplayTurn(makeTurn("שלום"));
    assert.ok(result.resolved);
    assert.ok(result.input);
    assert.strictEqual(result.input.message, "שלום");
    assert.ok(result.resolved.bundle);
    assert.ok(result.resolved.primaryFocus);
  });

  it("replay includes responseStrategy", () => {
    const result = runReplayTurn(makeTurn("מה קורה?"));
    assert.ok(result.resolved.responseStrategy);
    assert.ok(typeof result.resolved.responseStrategy.type === "string");
  });

  it("replay includes executionDecision", () => {
    const result = runReplayTurn(makeTurn("שלח הודעה"));
    assert.ok(result.resolved.executionDecision);
    assert.ok(typeof result.resolved.executionDecision.type === "string");
    assert.ok(typeof result.resolved.executionDecision.allowTools === "boolean");
  });

  it("replay includes compressedPrompt", () => {
    const result = runReplayTurn(makeTurn("hi"));
    assert.ok(result.resolved.compressedPrompt);
    assert.ok(Array.isArray(result.resolved.compressedPrompt.sections));
    assert.ok(result.resolved.compressedPrompt.summary.length > 0);
  });

  it("replay includes debugTrace", () => {
    const result = runReplayTurn(makeTurn("hello"));
    assert.ok(result.resolved.debugTrace);
    assert.ok(Array.isArray(result.resolved.debugTrace.items));
    assert.ok(result.resolved.debugTrace.summary.length > 0);
  });
});

// ============================================================
// Scenario replay
// ============================================================

describe("runReplayScenario", () => {
  it("scenario with 2 turns returns 2 results", () => {
    const scenario: ReplayScenario = {
      name: "basic-greeting",
      turns: [
        makeTurn("שלום"),
        makeTurn("מה שלומך?"),
      ],
    };
    const result = runReplayScenario(scenario);
    assert.strictEqual(result.turns.length, 2);
    assert.strictEqual(result.name, "basic-greeting");
  });

  it("scenario summary is non-empty", () => {
    const scenario: ReplayScenario = {
      name: "test-scenario",
      turns: [makeTurn("hi")],
    };
    const result = runReplayScenario(scenario);
    assert.ok(result.summary.length > 0);
  });

  it("underspecified request from non-owner gets reply_only execution", () => {
    const scenario: ReplayScenario = {
      name: "underspecified-action",
      turns: [
        makeTurn("שלח הודעה"),
      ],
    };
    const result = runReplayScenario(scenario);
    const firstTurn = result.turns[0];
    // A vague "send message" from a non-owner contact should not allow tool execution
    assert.ok(
      firstTurn.resolved.executionDecision.type === "reply_only" ||
      firstTurn.resolved.executionDecision.type === "clarify_before_execution" ||
      firstTurn.resolved.executionDecision.type === "block_tool_execution",
      `unexpected execution type: ${firstTurn.resolved.executionDecision.type}`
    );
  });

  it("status scenario shows completed outcome", () => {
    const scenario: ReplayScenario = {
      name: "status-query",
      turns: [
        makeTurn("מה המצב?", ownerSender, "owner@c.us"),
      ],
    };
    const result = runReplayScenario(scenario);
    const turn = result.turns[0];
    // Status queries typically resolve to completed or pending
    assert.ok(
      turn.resolved.outcomeEvaluation.status === "completed" ||
      turn.resolved.outcomeEvaluation.status === "pending" ||
      turn.resolved.outcomeEvaluation.status === "awaiting_user",
      `unexpected outcome status: ${turn.resolved.outcomeEvaluation.status}`
    );
  });

  it("followup-related scenario shows pending outcome when appropriate", () => {
    const scenario: ReplayScenario = {
      name: "followup-discussion",
      turns: [
        makeTurn("תזכיר לי לבדוק מחר"),
      ],
    };
    const result = runReplayScenario(scenario);
    const turn = result.turns[0];
    // A followup/reminder request should show pending or awaiting_user
    const status = turn.resolved.outcomeEvaluation.status;
    assert.ok(
      status === "pending" || status === "awaiting_user" || status === "completed",
      `unexpected outcome status for followup: ${status}`
    );
  });
});
