import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const CAP_DIR = resolve(__dirname, "..", "workspace", "capability_requests");
function resetCapabilities() {
  for (const sub of ["pending", "approved", "rejected"]) {
    const dir = resolve(CAP_DIR, sub);
    if (existsSync(dir)) {
      for (const f of require("fs").readdirSync(dir)) {
        if (f.endsWith(".md")) rmSync(resolve(dir, f));
      }
    } else {
      mkdirSync(dir, { recursive: true });
    }
  }
}

import { classifyTeaching } from "../src/capabilities/classifier";
import { createSpec, listPending, approveSpec, rejectSpec, getSpec } from "../src/capabilities";

describe("capabilities", () => {
  describe("classifier", () => {
    it("classifies fact as fact", () => {
      const r = classifyTeaching("הרופא שלי הוא ד\"ר כהן");
      assert.strictEqual(r.level, "fact");
    });

    it("classifies instruction as instruction", () => {
      const r = classifyTeaching("תזכרי שכשאני אומר 'טוב' אני מתכוון לסגור שיחה");
      assert.strictEqual(r.level, "instruction");
    });

    it("classifies 'תלמדי איך' as capability", () => {
      const r = classifyTeaching("תלמדי איך לסכם קבוצות וואטסאפ");
      assert.strictEqual(r.level, "capability");
    });

    it("classifies 'תוסיפי יכולת' as capability", () => {
      const r = classifyTeaching("תוסיפי יכולת לחבר API של Spotify");
      assert.strictEqual(r.level, "capability");
    });

    it("classifies 'add support' as capability", () => {
      const r = classifyTeaching("add support for sending voice messages");
      assert.strictEqual(r.level, "capability");
    });

    it("classifies 'מעכשיו' as instruction", () => {
      const r = classifyTeaching("מעכשיו תמיד תעני באנגלית");
      assert.strictEqual(r.level, "instruction");
    });

    it("classifies 'program yourself' as capability", () => {
      const r = classifyTeaching("program yourself to handle calendar conflicts");
      assert.strictEqual(r.level, "capability");
    });
  });

  describe("spec-store", () => {
    beforeEach(() => resetCapabilities());

    it("creates and retrieves a spec", () => {
      const spec = createSpec({
        title: "Group summary",
        requestedBy: "Rani",
        problem: "Cannot summarize group messages",
        whyCurrentSystemCantDoIt: "No tool to read group history",
        proposedSolution: "Add get_group_history tool",
        affectedModules: ["handle-tool-call.ts", "contacts tools"],
        requiredTools: [],
        risks: ["May expose private conversations"],
        validationPlan: "Ask to summarize a group and check output",
        level: "tool_addition",
      });

      assert.ok(spec.id.startsWith("cap-"));
      assert.strictEqual(spec.status, "pending");

      const retrieved = getSpec(spec.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.title, "Group summary");
    });

    it("lists pending specs", () => {
      createSpec({
        title: "Test cap",
        requestedBy: "Test",
        problem: "test",
        whyCurrentSystemCantDoIt: "test",
        proposedSolution: "test",
        affectedModules: [],
        requiredTools: [],
        risks: [],
        validationPlan: "",
        level: "code_change",
      });

      const pending = listPending();
      assert.strictEqual(pending.length, 1);
      assert.strictEqual(pending[0].title, "Test cap");
    });

    it("approves a spec (moves from pending to approved)", () => {
      const spec = createSpec({
        title: "Approve me",
        requestedBy: "Test",
        problem: "test",
        whyCurrentSystemCantDoIt: "test",
        proposedSolution: "test",
        affectedModules: [],
        requiredTools: [],
        risks: [],
        validationPlan: "",
        level: "prompt_only",
      });

      const approved = approveSpec(spec.id);
      assert.ok(approved);
      assert.strictEqual(approved!.status, "approved");
      assert.strictEqual(listPending().length, 0);

      const retrieved = getSpec(spec.id);
      assert.strictEqual(retrieved!.status, "approved");
    });

    it("rejects a spec (moves from pending to rejected)", () => {
      const spec = createSpec({
        title: "Reject me",
        requestedBy: "Test",
        problem: "test",
        whyCurrentSystemCantDoIt: "test",
        proposedSolution: "test",
        affectedModules: [],
        requiredTools: [],
        risks: [],
        validationPlan: "",
        level: "integration",
      });

      const rejected = rejectSpec(spec.id);
      assert.ok(rejected);
      assert.strictEqual(rejected!.status, "rejected");
      assert.strictEqual(listPending().length, 0);
    });

    it("returns null for non-existent spec", () => {
      assert.strictEqual(getSpec("cap-nonexistent"), null);
      assert.strictEqual(approveSpec("cap-nonexistent"), null);
    });
  });
});
