import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(__dirname, "..", "workspace", "state");
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
// Reset conversations for each test
function reset() {
  writeFileSync(resolve(STATE_DIR, "conversations.json"), "{}", "utf-8");
}

import { handleResponse } from "../src/whatsapp/response-handler";

describe("response-handler", () => {
  beforeEach(() => reset());

  it("skips [SKIP] responses", async () => {
    let replied = false;
    let reacted = false;
    await handleResponse("chat@lid", "User", "[SKIP]",
      async () => { replied = true; },
      async () => { reacted = true; }
    );
    assert.strictEqual(replied, false);
    assert.strictEqual(reacted, false);
  });

  it("handles reaction-only [REACT:emoji]", async () => {
    let reacted = "";
    let replied = false;
    await handleResponse("chat@lid", "User", "[REACT:👍]",
      async () => { replied = true; },
      async (emoji) => { reacted = emoji; }
    );
    assert.strictEqual(reacted, "👍");
    assert.strictEqual(replied, false);
  });

  it("handles reaction + text [REACT:emoji] text", async () => {
    let reacted = "";
    let repliedText = "";
    await handleResponse("chat@lid", "User", "[REACT:😊] שלום!",
      async (text) => { repliedText = text; },
      async (emoji) => { reacted = emoji; }
    );
    assert.strictEqual(reacted, "😊");
    assert.strictEqual(repliedText, "שלום!");
  });

  it("handles plain text response", async () => {
    let repliedText = "";
    await handleResponse("chat@lid", "User", "תשובה רגילה",
      async (text) => { repliedText = text; },
      async () => {}
    );
    assert.strictEqual(repliedText, "תשובה רגילה");
  });
});
