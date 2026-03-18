import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(__dirname, "..", "workspace", "state");
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

function resetState() {
  writeFileSync(resolve(STATE_DIR, "approved.json"), "[]", "utf-8");
  writeFileSync(resolve(STATE_DIR, "pending.json"), "{}", "utf-8");
}

import { checkApprovalGate } from "../src/whatsapp/approval-gate";
import { approvalStore } from "../src/stores";

describe("approval-gate", () => {
  beforeEach(() => resetState());

  it("lets approved contacts through (returns false)", async () => {
    approvalStore.addApproved("chat1@lid");
    const blocked = await checkApprovalGate({
      chatId: "chat1@lid",
      phone: "972501234567",
      contactName: "Test",
      body: "שלום",
      reply: async () => {},
      sendToChat: async () => {},
    });
    assert.strictEqual(blocked, false);
  });

  it("blocks unapproved contacts (returns true)", async () => {
    let replied = false;
    let sentToOwner = false;
    const blocked = await checkApprovalGate({
      chatId: "new@lid",
      phone: "972509999999",
      contactName: "NewPerson",
      body: "היי",
      reply: async () => { replied = true; },
      sendToChat: async () => { sentToOwner = true; },
    });
    assert.strictEqual(blocked, true);
    assert.ok(replied, "should reply to unapproved contact");
    assert.ok(sentToOwner, "should notify owner");
  });

  it("does not send duplicate pending notifications", async () => {
    let ownerNotifyCount = 0;
    const ctx = {
      chatId: "new@lid",
      phone: "972509999999",
      contactName: "NewPerson",
      body: "היי",
      reply: async () => {},
      sendToChat: async () => { ownerNotifyCount++; },
    };

    await checkApprovalGate(ctx);
    await checkApprovalGate(ctx); // second message from same unapproved contact
    assert.strictEqual(ownerNotifyCount, 1, "should notify owner only once");
  });

  it("after approval, contact passes through", async () => {
    // First: blocked
    const code = approvalStore.addPending("new@lid", "+972509999999");
    // Then: owner approves
    approvalStore.approveByCode(code);
    // Now: should pass
    const blocked = await checkApprovalGate({
      chatId: "new@lid",
      phone: "972509999999",
      contactName: "NewPerson",
      body: "שלום שוב",
      reply: async () => {},
      sendToChat: async () => {},
    });
    assert.strictEqual(blocked, false);
  });

  it("rejected contact is still blocked", async () => {
    const code = approvalStore.addPending("new@lid", "+972509999999");
    approvalStore.rejectByCode(code);
    // Still blocked (not approved, no longer pending so will re-notify)
    const blocked = await checkApprovalGate({
      chatId: "new@lid",
      phone: "972509999999",
      contactName: "NewPerson",
      body: "שלום שוב",
      reply: async () => {},
      sendToChat: async () => {},
    });
    assert.strictEqual(blocked, true);
  });
});
