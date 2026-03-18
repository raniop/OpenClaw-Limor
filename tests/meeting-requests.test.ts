import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// Ensure state directory exists
const STATE_DIR = resolve(__dirname, "..", "workspace", "state");
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

function resetState() {
  writeFileSync(resolve(STATE_DIR, "active_tasks.json"), "{}", "utf-8");
}

import {
  hasPendingRequest,
  addMeetingRequest,
  getMeetingRequestById,
  getLastMeetingRequest,
  getMeetingRequestCount,
  removeMeetingRequest,
} from "../src/meeting-requests";

describe("meeting-requests", () => {
  beforeEach(() => resetState());

  describe("addMeetingRequest", () => {
    it("returns an M-prefixed ID", () => {
      const id = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      assert.ok(id.startsWith("M"));
      assert.ok(id.length >= 5);
    });

    it("prevents duplicate from same requester", () => {
      const id1 = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      const id2 = addMeetingRequest("chat1@lid", "יוני", "פגישה אחרת");
      assert.strictEqual(id1, id2);
    });

    it("allows different requesters", () => {
      const id1 = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      const id2 = addMeetingRequest("chat2@lid", "עמית", "שיחה");
      assert.notStrictEqual(id1, id2);
    });

    it("marks requester as having pending request", () => {
      addMeetingRequest("chat1@lid", "יוני", "פגישה");
      assert.ok(hasPendingRequest("chat1@lid"));
    });
  });

  describe("getMeetingRequestById", () => {
    it("finds by exact ID", () => {
      const id = addMeetingRequest("chat1@lid", "יוני", "פגישה", "מחר ב-10");
      const req = getMeetingRequestById(id);
      assert.ok(req);
      assert.strictEqual(req!.id, id);
      assert.strictEqual(req!.requesterName, "יוני");
      assert.strictEqual(req!.topic, "פגישה");
      assert.strictEqual(req!.preferredTime, "מחר ב-10");
    });

    it("is case-insensitive", () => {
      const id = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      const req = getMeetingRequestById(id.toLowerCase());
      assert.ok(req);
    });

    it("returns null for invalid ID", () => {
      assert.strictEqual(getMeetingRequestById("MZZZZZ"), null);
    });
  });

  describe("removeMeetingRequest", () => {
    it("removes and returns the request", () => {
      const id = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      const req = removeMeetingRequest(id);
      assert.ok(req);
      assert.strictEqual(req!.requesterName, "יוני");
      assert.ok(!hasPendingRequest("chat1@lid"));
    });

    it("returns null for invalid ID", () => {
      assert.strictEqual(removeMeetingRequest("MZZZZZ"), null);
    });
  });

  describe("race condition protection", () => {
    it("two requests — count returns 2", () => {
      addMeetingRequest("chat1@lid", "יוני", "פגישה");
      addMeetingRequest("chat2@lid", "עמית", "שיחה");
      assert.strictEqual(getMeetingRequestCount(), 2);
    });

    it("removing one does not affect the other", () => {
      const id1 = addMeetingRequest("chat1@lid", "יוני", "פגישה");
      addMeetingRequest("chat2@lid", "עמית", "שיחה");

      removeMeetingRequest(id1);
      assert.ok(!hasPendingRequest("chat1@lid"));
      assert.ok(hasPendingRequest("chat2@lid"));
      assert.strictEqual(getMeetingRequestCount(), 1);
    });
  });

  describe("getLastMeetingRequest", () => {
    it("returns null when empty", () => {
      assert.strictEqual(getLastMeetingRequest(), null);
    });

    it("returns the last request with ID", () => {
      addMeetingRequest("chat1@lid", "יוני", "פגישה");
      const id2 = addMeetingRequest("chat2@lid", "עמית", "שיחה");
      const last = getLastMeetingRequest();
      assert.ok(last);
      assert.strictEqual(last!.id, id2);
    });
  });
});
