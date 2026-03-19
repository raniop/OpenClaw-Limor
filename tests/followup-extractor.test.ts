import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";

// Clean the followups store before each test
const STORE_PATH = resolve(__dirname, "..", "workspace", "state", "followups.json");

function cleanStore(): void {
  if (existsSync(STORE_PATH)) {
    unlinkSync(STORE_PATH);
  }
}

// Must import AFTER cleaning to avoid stale state
import { extractFollowups } from "../src/followups/followup-extractor";

describe("extractFollowups", () => {
  beforeEach(() => {
    cleanStore();
  });

  it("detects 'נדבר מחר'", () => {
    const results = extractFollowups(
      "בסדר, נדבר מחר על זה!",
      "test@c.us",
      "יוסי"
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].reason, "נדבר מחר");
    assert.strictEqual(results[0].contactName, "יוסי");
    assert.strictEqual(results[0].status, "pending");
  });

  it("detects 'אחזור אליך'", () => {
    const results = extractFollowups(
      "אחזור אליך עם תשובה",
      "test@c.us",
      "דנה"
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].reason, "אחזור אליך");
  });

  it("detects 'צריך לבדוק'", () => {
    const results = extractFollowups(
      "צריך לבדוק את המספרים",
      "test@c.us",
      "עמית"
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].reason, "צריך לבדוק");
  });

  it("returns empty for [SKIP]", () => {
    const results = extractFollowups("[SKIP]", "test@c.us", "יוסי");
    assert.strictEqual(results.length, 0);
  });

  it("returns empty for [REACT:emoji]", () => {
    const results = extractFollowups("[REACT:👍]", "test@c.us", "יוסי");
    assert.strictEqual(results.length, 0);
  });

  it("returns empty when no patterns match", () => {
    const results = extractFollowups(
      "תודה רבה! שיהיה לך יום טוב",
      "test@c.us",
      "יוסי"
    );
    assert.strictEqual(results.length, 0);
  });

  it("extracts only one followup per message", () => {
    const results = extractFollowups(
      "נדבר מחר ואחזור אליך עם תשובה",
      "test@c.us",
      "יוסי"
    );
    assert.strictEqual(results.length, 1);
  });
});
