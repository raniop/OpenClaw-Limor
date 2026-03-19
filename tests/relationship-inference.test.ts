import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferRelationshipUpdate, calculateImportanceScore } from "../src/relationship-memory/relationship-inference";
import type { RelationshipProfile } from "../src/relationship-memory/relationship-types";

const baseProfile: RelationshipProfile = {
  chatId: "test@c.us",
  name: "Test",
  relationshipType: "unknown",
  importanceScore: 20,
  communicationStyle: "unknown",
  notes: [],
  interactionCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseContext = { isOwner: false, isGroup: false };

describe("inferRelationshipUpdate", () => {
  describe("relationship type", () => {
    it("detects client from insurance keywords", () => {
      const result = inferRelationshipUpdate(null, "רציתי לשאול לגבי הפוליסה שלי", "יוסי", baseContext);
      assert.strictEqual(result.relationshipType, "client");
    });

    it("detects family from family keywords", () => {
      const result = inferRelationshipUpdate(null, "שלום אמא, מה שלומך?", "אמא", baseContext);
      assert.strictEqual(result.relationshipType, "family");
    });

    it("detects lead from meeting context", () => {
      const result = inferRelationshipUpdate(null, "שלום, אני מעוניין", "דני", { ...baseContext, hasMeetingRequest: true });
      assert.strictEqual(result.relationshipType, "lead");
    });

    it("detects work from work keywords", () => {
      const result = inferRelationshipUpdate(null, "שלום, רציתי לדבר על הפרויקט שלנו", "עמית", baseContext);
      assert.strictEqual(result.relationshipType, "work");
    });

    it("returns unknown for generic messages", () => {
      const result = inferRelationshipUpdate(null, "שלום, מה קורה?", "יוסי", baseContext);
      assert.strictEqual(result.relationshipType, undefined);
    });
  });

  describe("no downgrade of strong relationships", () => {
    it("does not downgrade client to unknown", () => {
      const clientProfile = { ...baseProfile, relationshipType: "client" as const };
      const result = inferRelationshipUpdate(clientProfile, "שלום מה קורה?", "יוסי", baseContext);
      assert.notStrictEqual(result.relationshipType, "unknown");
    });

    it("does not downgrade family to unknown", () => {
      const familyProfile = { ...baseProfile, relationshipType: "family" as const };
      const result = inferRelationshipUpdate(familyProfile, "שלום מה קורה?", "אמא", baseContext);
      assert.notStrictEqual(result.relationshipType, "unknown");
    });

    it("allows upgrade from unknown to client", () => {
      const result = inferRelationshipUpdate(baseProfile, "מה עם הפוליסה?", "יוסי", baseContext);
      assert.strictEqual(result.relationshipType, "client");
    });
  });

  describe("communication style", () => {
    it("detects formal style", () => {
      const result = inferRelationshipUpdate(null, "שלום רב, רציתי לברר בנושא", "יוסי", baseContext);
      assert.strictEqual(result.communicationStyle, "formal");
    });

    it("detects warm style with emojis", () => {
      const result = inferRelationshipUpdate(null, "שלום יקירי! ❤️ מתגעגע!!!", "אבא", baseContext);
      assert.strictEqual(result.communicationStyle, "warm");
    });

    it("detects brief style for short messages", () => {
      const result = inferRelationshipUpdate(null, "בסדר תודה", "יוסי", baseContext);
      assert.strictEqual(result.communicationStyle, "brief");
    });

    it("detects friendly style with emoji", () => {
      const result = inferRelationshipUpdate(null, "מה קורה אחי, הכל טוב? 😊", "גיא", baseContext);
      assert.strictEqual(result.communicationStyle, "friendly");
    });
  });
});

describe("calculateImportanceScore", () => {
  it("gives family minimum 80", () => {
    const score = calculateImportanceScore("family", 1, undefined, baseContext);
    assert.ok(score >= 80);
  });

  it("gives client minimum 70", () => {
    const score = calculateImportanceScore("client", 1, undefined, baseContext);
    assert.ok(score >= 70);
  });

  it("boosts for approved contacts", () => {
    const base = calculateImportanceScore("unknown", 1, undefined, baseContext);
    const boosted = calculateImportanceScore("unknown", 1, undefined, { ...baseContext, isApprovedContact: true });
    assert.ok(boosted > base);
  });

  it("boosts for high interaction count", () => {
    const low = calculateImportanceScore("unknown", 1, undefined, baseContext);
    const high = calculateImportanceScore("unknown", 15, undefined, baseContext);
    assert.ok(high > low);
  });

  it("clamps to 1-100 range", () => {
    const score = calculateImportanceScore("family", 100, new Date().toISOString(), { ...baseContext, isApprovedContact: true, hasMeetingRequest: true });
    assert.ok(score >= 1 && score <= 100);
  });

  it("applies decay for old interactions", () => {
    const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(); // 35 days ago
    const recent = calculateImportanceScore("unknown", 5, new Date().toISOString(), baseContext);
    const old = calculateImportanceScore("unknown", 5, oldDate, baseContext);
    assert.ok(old < recent);
  });
});
