import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Set owner chat ID for tests (needed by approval-gate sendToChat logic)
process.env.OWNER_CHAT_ID = "owner@c.us";

import { checkApprovalGate } from "../src/whatsapp/approval-gate";
import { approvalStore } from "../src/stores";
import { getDb } from "../src/stores/sqlite-init";

function resetState() {
  const db = getDb();
  db.exec("DELETE FROM approved_contacts");
  db.exec("DELETE FROM pending_contacts");
}

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
    // First: add as pending then approve
    const code = approvalStore.addPending("new@lid", "+972509999999");
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
