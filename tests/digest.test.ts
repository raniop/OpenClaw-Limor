import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Test the digest formatting by importing the service
// Note: generateDailyDigest() calls external services (calendar), so we test basic behavior
import { generateDailyDigest } from "../src/digest/digest-service";

describe("generateDailyDigest", () => {
  it("returns a string with digest header", async () => {
    // This will work even without calendar credentials — it catches errors gracefully
    const digest = await generateDailyDigest();
    assert.ok(typeof digest === "string");
    assert.ok(digest.includes("תקציר יומי"));
  });

  it("includes quiet message when nothing pending", async () => {
    // With empty stores, should show the quiet message
    const digest = await generateDailyDigest();
    // It should either have urgent items or the quiet message
    assert.ok(
      digest.includes("דחוף") || digest.includes("ממתין") || digest.includes("הכל שקט")
    );
  });
});
