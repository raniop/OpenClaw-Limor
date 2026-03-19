import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "fs";
import { resolve } from "path";

const STORE_PATH = resolve(__dirname, "..", "workspace", "state", "decisions.json");

function cleanStore(): void {
  if (existsSync(STORE_PATH)) unlinkSync(STORE_PATH);
}

import { recordDecision, getRecentDecisions, getDecisionsByCategory, getDecisionsByTarget } from "../src/explain/decision-store";

describe("decision-store", () => {
  beforeEach(() => cleanStore());

  it("records and retrieves a decision", () => {
    recordDecision({
      actor: "system",
      category: "approval",
      summary: "Approved contact",
      outcome: "success",
      target: "יוסי",
    });

    const decisions = getRecentDecisions(5);
    assert.strictEqual(decisions.length, 1);
    assert.strictEqual(decisions[0].category, "approval");
    assert.strictEqual(decisions[0].target, "יוסי");
  });

  it("filters by category", () => {
    recordDecision({ actor: "system", category: "approval", summary: "a", outcome: "ok" });
    recordDecision({ actor: "system", category: "meeting", summary: "b", outcome: "ok" });
    recordDecision({ actor: "system", category: "approval", summary: "c", outcome: "ok" });

    const approvals = getDecisionsByCategory("approval");
    assert.strictEqual(approvals.length, 2);
  });

  it("filters by target", () => {
    recordDecision({ actor: "system", category: "tool", summary: "a", outcome: "ok", target: "יוסי" });
    recordDecision({ actor: "system", category: "tool", summary: "b", outcome: "ok", target: "דני" });

    const yossi = getDecisionsByTarget("יוסי");
    assert.strictEqual(yossi.length, 1);
    assert.strictEqual(yossi[0].target, "יוסי");
  });

  it("generates unique IDs", () => {
    const d1 = recordDecision({ actor: "x", category: "tool", summary: "a", outcome: "ok" });
    const d2 = recordDecision({ actor: "x", category: "tool", summary: "b", outcome: "ok" });
    assert.notStrictEqual(d1.id, d2.id);
  });
});
