import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const USERS_DIR = resolve(__dirname, "..", "workspace", "memory", "users");
if (!existsSync(USERS_DIR)) mkdirSync(USERS_DIR, { recursive: true });

function resetMemory() {
  for (const f of ["test1_lid.md", "test2_lid.md", "migrate_lid.md"]) {
    try { rmSync(resolve(USERS_DIR, f)); } catch {}
  }
}

import { getMemoryContext, saveExtractedFacts } from "../src/memory";

describe("memory", () => {
  beforeEach(() => resetMemory());

  describe("saveExtractedFacts + getMemoryContext", () => {
    it("saves and retrieves facts", () => {
      saveExtractedFacts("test1@lid", ["אוהב סושי", "גר בתל אביב"], "יוני");
      const ctx = getMemoryContext("test1@lid");
      assert.ok(ctx.includes("יוני"));
      assert.ok(ctx.includes("אוהב סושי"));
      assert.ok(ctx.includes("גר בתל אביב"));
    });

    it("returns empty string for unknown user", () => {
      const ctx = getMemoryContext("unknown@lid");
      assert.strictEqual(ctx, "");
    });

    it("deduplicates similar facts", () => {
      saveExtractedFacts("test1@lid", ["אוהב סושי"]);
      saveExtractedFacts("test1@lid", ["אוהב סושי"]);
      const ctx = getMemoryContext("test1@lid");
      const matches = ctx.match(/אוהב סושי/g);
      assert.strictEqual(matches?.length, 1);
    });

    it("deduplicates facts with high word overlap", () => {
      saveExtractedFacts("test1@lid", ["עובד כמהנדס תוכנה בגוגל"]);
      saveExtractedFacts("test1@lid", ["עובד כמהנדס תוכנה בגוגל ישראל"]);
      const ctx = getMemoryContext("test1@lid");
      const factLines = ctx.split("\n").filter(l => l.startsWith("- ") && !l.includes("השם"));
      assert.strictEqual(factLines.length, 1);
    });

    it("skips empty fact arrays", () => {
      saveExtractedFacts("test1@lid", []);
      const ctx = getMemoryContext("test1@lid");
      assert.strictEqual(ctx, "");
    });

    it("saves userName along with facts", () => {
      saveExtractedFacts("test1@lid", ["עובד בהייטק"], "דוד");
      const ctx = getMemoryContext("test1@lid");
      assert.ok(ctx.includes("דוד"));
      assert.ok(ctx.includes("עובד בהייטק"));
    });
  });

  describe("markdown format", () => {
    it("writes valid markdown file", () => {
      saveExtractedFacts("test1@lid", ["fact one", "fact two"], "TestUser");
      const filePath = resolve(USERS_DIR, "test1_lid.md");
      assert.ok(existsSync(filePath));
      const content = readFileSync(filePath, "utf-8");
      assert.ok(content.includes("# User Profile"));
      assert.ok(content.includes("Name: TestUser"));
      assert.ok(content.includes("## Known Facts"));
      assert.ok(content.includes("- fact one"));
      assert.ok(content.includes("- fact two"));
    });

    it("reads back from markdown correctly", () => {
      // Write markdown directly
      const filePath = resolve(USERS_DIR, "test2_lid.md");
      writeFileSync(filePath, "# User Profile\nName: Manual\n\n## Known Facts\n- manual fact\n", "utf-8");
      const ctx = getMemoryContext("test2@lid");
      assert.ok(ctx.includes("Manual"));
      assert.ok(ctx.includes("manual fact"));
    });
  });

  describe("max facts trimming", () => {
    it("trims to MAX_FACTS_PER_USER (50)", () => {
      // Add 60 unique facts in a single call
      const facts = Array.from({ length: 60 }, (_, i) => `xfact${i.toString().padStart(3, "0")}`);
      saveExtractedFacts("test1@lid", facts);
      const ctx = getMemoryContext("test1@lid");
      const factLines = ctx.split("\n").filter(l => l.startsWith("- ") && l.includes("xfact"));
      assert.ok(factLines.length <= 50, `Expected <=50 facts, got ${factLines.length}`);
    });
  });

  describe("migration from old JSON", () => {
    it("migrates user from old JSON to markdown on first read", () => {
      // This test relies on the old memories.json having data for a chatId
      // that doesn't have a markdown file yet. We simulate by writing directly.
      const mdPath = resolve(USERS_DIR, "migrate_lid.md");
      assert.ok(!existsSync(mdPath), "markdown should not exist yet");

      // Write to old JSON store (simulate old data)
      const oldPath = resolve(__dirname, "..", "memory", "memories.json");
      if (existsSync(oldPath)) {
        const store = JSON.parse(readFileSync(oldPath, "utf-8"));
        store["migrate@lid"] = { name: "OldUser", facts: [{ text: "old fact", savedAt: "2025-01-01" }] };
        writeFileSync(oldPath, JSON.stringify(store, null, 2), "utf-8");

        // Now read — should migrate
        const ctx = getMemoryContext("migrate@lid");
        assert.ok(ctx.includes("OldUser") || ctx.includes("old fact"), "should load from old JSON");

        // Clean up old store
        delete store["migrate@lid"];
        writeFileSync(oldPath, JSON.stringify(store, null, 2), "utf-8");
      }
    });
  });
});
