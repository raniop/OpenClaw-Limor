import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(__dirname, "..", "workspace", "state");
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

function resetContacts() {
  writeFileSync(resolve(STATE_DIR, "contacts.json"), "{}", "utf-8");
}

import {
  updateContact,
  findContactByName,
  findContactByPhone,
  addManualContact,
  getRecentContacts,
} from "../src/contacts";

describe("contacts", () => {
  beforeEach(() => resetContacts());

  describe("updateContact + findContactByName", () => {
    it("finds exact name match", () => {
      updateContact("chat1@lid", "Yoni Avni", "972501111111");
      const c = findContactByName("Yoni Avni");
      assert.ok(c);
      assert.strictEqual(c!.chatId, "chat1@lid");
    });

    it("finds partial name match", () => {
      updateContact("chat1@lid", "Yoni Avni", "972501111111");
      const c = findContactByName("Yoni");
      assert.ok(c);
      assert.strictEqual(c!.name, "Yoni Avni");
    });

    it("finds Hebrew name translation", () => {
      updateContact("chat1@lid", "עמית", "972501111111");
      const c = findContactByName("amit");
      assert.ok(c);
      assert.strictEqual(c!.name, "עמית");
    });

    it("returns null for unknown name", () => {
      assert.strictEqual(findContactByName("NonExistent"), null);
    });

    it("prefers personal chatId over group", () => {
      updateContact("group@g.us", "GroupUser", "972501111111");
      updateContact("personal@lid", "GroupUser", "972501111111");
      const c = findContactByName("GroupUser");
      assert.ok(c);
      assert.strictEqual(c!.chatId, "personal@lid");
    });
  });

  describe("findContactByPhone", () => {
    it("finds by phone number", () => {
      updateContact("chat1@lid", "Test", "972501234567");
      const c = findContactByPhone("972501234567");
      assert.ok(c);
      assert.strictEqual(c!.name, "Test");
    });

    it("finds by partial phone", () => {
      updateContact("chat1@lid", "Test", "972501234567");
      const c = findContactByPhone("501234567");
      assert.ok(c);
    });
  });

  describe("addManualContact", () => {
    it("creates a manual contact", () => {
      const result = addManualContact("Dan Cohen", "0501234567");
      assert.ok(result.includes("נשמר"));
      const c = findContactByName("Dan Cohen");
      assert.ok(c);
      assert.ok(c!.chatId.startsWith("manual_"));
    });

    it("returns existing for duplicate phone", () => {
      addManualContact("Dan Cohen", "0501234567");
      const result = addManualContact("Dan Cohen", "0501234567");
      assert.ok(result.includes("כבר קיים"));
    });
  });

  describe("getRecentContacts", () => {
    it("returns contacts sorted by lastSeen", () => {
      updateContact("chat1@lid", "First", "111");
      updateContact("chat2@lid", "Second", "222");
      const recent = getRecentContacts(2);
      assert.strictEqual(recent.length, 2);
    });

    it("respects limit", () => {
      updateContact("chat1@lid", "A", "111");
      updateContact("chat2@lid", "B", "222");
      updateContact("chat3@lid", "C", "333");
      const recent = getRecentContacts(2);
      assert.strictEqual(recent.length, 2);
    });
  });
});
