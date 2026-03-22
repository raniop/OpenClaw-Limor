import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { statePath, getStateDir } from "../src/state-dir";
import { getDb } from "../src/stores/sqlite-init";

const stateDir = getStateDir();
if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

function resetState() {
  const db = getDb();
  db.exec("DELETE FROM approved_contacts");
  db.exec("DELETE FROM pending_contacts");
  writeFileSync(statePath("active_tasks.json"), "{}", "utf-8");
}

// Note: handleOwnerCommand calls sendMessage which requires the full AI stack.
// We test the parts that DON'T call sendMessage — contact approval/rejection and bare approve logic.
// Meeting approval/rejection flows that call sendMessage are integration-tested manually.

import { approvalStore } from "../src/stores";
import { parseOwnerCommand } from "../src/command-parser";

describe("owner-commands (unit logic)", () => {
  beforeEach(() => resetState());

  describe("contact approval end-to-end", () => {
    it("full flow: new contact → pending → owner approves by code → contact approved", () => {
      // Step 1: New contact arrives, gets pending code
      const code = approvalStore.addPending("newguy@lid", "+972501111111");
      assert.ok(code.length >= 4);
      assert.ok(approvalStore.isPending("newguy@lid"));
      assert.ok(!approvalStore.isApproved("newguy@lid"));

      // Step 2: Owner parses command
      const cmd = parseOwnerCommand(`אשר ${code}`);
      assert.ok(cmd);
      assert.strictEqual(cmd!.type, "approve_contact");
      assert.strictEqual((cmd as any).code, code.toUpperCase());

      // Step 3: Execute approval
      const entry = approvalStore.approveByCode(code);
      assert.ok(entry);
      assert.strictEqual(entry!.phone, "+972501111111");

      // Step 4: Verify state
      assert.ok(approvalStore.isApproved("newguy@lid"));
      assert.ok(!approvalStore.isPending("newguy@lid"));
    });

    it("full flow: new contact → pending → owner rejects by code → contact NOT approved", () => {
      const code = approvalStore.addPending("badguy@lid", "+972502222222");

      const cmd = parseOwnerCommand(`דחה ${code}`);
      assert.strictEqual(cmd!.type, "reject_contact");

      const entry = approvalStore.rejectByCode(code);
      assert.ok(entry);
      assert.ok(!approvalStore.isApproved("badguy@lid"));
      assert.ok(!approvalStore.isPending("badguy@lid"));
    });
  });

  describe("bare approve ambiguity", () => {
    it("1 pending: bare 'כן' resolves to bare_approve", () => {
      approvalStore.addPending("one@lid", "+111");
      const cmd = parseOwnerCommand("כן");
      assert.strictEqual(cmd!.type, "bare_approve");
      // In handleOwnerCommand, this would approve since pendingCount === 1
      assert.strictEqual(approvalStore.getPendingCount(), 1);
    });

    it("2 pending: bare 'כן' should NOT blindly approve", () => {
      approvalStore.addPending("one@lid", "+111");
      approvalStore.addPending("two@lid", "+222");
      const cmd = parseOwnerCommand("כן");
      assert.strictEqual(cmd!.type, "bare_approve");
      // In handleOwnerCommand, this would show ambiguity message since pendingCount > 1
      assert.strictEqual(approvalStore.getPendingCount(), 2);
    });

    it("0 pending: bare 'כן' falls through (no pending to approve)", () => {
      const cmd = parseOwnerCommand("כן");
      assert.strictEqual(cmd!.type, "bare_approve");
      assert.strictEqual(approvalStore.getPendingCount(), 0);
      // In handleOwnerCommand, this would fall through to meeting check or AI
    });
  });

  // Meeting request tests removed — old FileMeetingRequestStore API (addMeetingRequest) is deprecated.
  // Meeting system was rebuilt; see src/meetings/meeting-state.ts for the new API.
});
