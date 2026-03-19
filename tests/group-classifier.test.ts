import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyGroupMessage } from "../src/whatsapp/group-classifier";

describe("classifyGroupMessage", () => {
  describe("should respond", () => {
    it("responds to direct name mention (Hebrew)", () => {
      const result = classifyGroupMessage("לימור מה השעה?", "יוסי");
      assert.strictEqual(result.shouldRespond, true);
      assert.strictEqual(result.isDirect, true);
    });

    it("responds to direct name mention (English)", () => {
      const result = classifyGroupMessage("limor check the calendar", "Yossi");
      assert.strictEqual(result.shouldRespond, true);
      assert.strictEqual(result.isDirect, true);
    });

    it("responds to slash commands", () => {
      const result = classifyGroupMessage("/help", "יוסי");
      assert.strictEqual(result.shouldRespond, true);
      assert.strictEqual(result.isDirect, true);
      assert.strictEqual(result.confidence, 1.0);
    });

    it("responds to short questions", () => {
      const result = classifyGroupMessage("מה קורה?", "יוסי");
      assert.strictEqual(result.shouldRespond, true);
    });

    it("responds to questions starting with question words", () => {
      const result = classifyGroupMessage("איך עושים את זה?", "יוסי");
      assert.strictEqual(result.shouldRespond, true);
    });
  });

  describe("should not respond", () => {
    it("skips regular conversation", () => {
      const result = classifyGroupMessage("אחי בוא נלך לאכול", "יוסי");
      assert.strictEqual(result.shouldRespond, false);
    });

    it("skips long messages without name mention", () => {
      const result = classifyGroupMessage(
        "שלום לכולם, רציתי לעדכן שאני הולך לעזוב את העבודה בסוף החודש ולהתחיל עבודה חדשה",
        "יוסי"
      );
      assert.strictEqual(result.shouldRespond, false);
    });

    it("skips greetings between people", () => {
      const result = classifyGroupMessage("בוקר טוב לכולם", "יוסי");
      assert.strictEqual(result.shouldRespond, false);
    });
  });
});
