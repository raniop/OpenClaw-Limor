import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";
import { statePath } from "./state-dir";

interface MeetingRequest {
  requesterChatId: string;
  requesterName: string;
  topic: string;
  preferredTime?: string;
  createdAt: string;
}

const OLD_REQUESTS_PATH = resolve(__dirname, "..", "memory", "meeting-requests.json");

function loadRequests(): Record<string, MeetingRequest> {
  return loadWithFallback<Record<string, MeetingRequest>>(statePath("active_tasks.json"), OLD_REQUESTS_PATH, {});
}

function saveRequests(data: Record<string, MeetingRequest>): void {
  writeFileSync(statePath("active_tasks.json"), JSON.stringify(data, null, 2), "utf-8");
}

export function hasPendingRequest(requesterChatId: string): boolean {
  const requests = loadRequests();
  return Object.values(requests).some((r) => r.requesterChatId === requesterChatId);
}

export function addMeetingRequest(
  requesterChatId: string,
  requesterName: string,
  topic: string,
  preferredTime?: string
): string {
  const requests = loadRequests();
  // Don't create duplicate requests from same person
  const existing = Object.entries(requests).find(
    ([, r]) => r.requesterChatId === requesterChatId
  );
  if (existing) {
    console.log(`⚠️ Meeting request from ${requesterName} already exists, skipping duplicate`);
    return existing[0];
  }
  const id = generateMeetingCode();
  requests[id] = {
    requesterChatId,
    requesterName,
    topic,
    preferredTime,
    createdAt: new Date().toISOString(),
  };
  saveRequests(requests);
  return id;
}

/** Look up meeting request by ID. */
export function getMeetingRequestById(id: string): (MeetingRequest & { id: string }) | null {
  const requests = loadRequests();
  const upper = id.toUpperCase();
  const req = requests[upper];
  if (!req) return null;
  return { ...req, id: upper };
}

/** Get the last meeting request. Legacy fallback. */
export function getLastMeetingRequest(): (MeetingRequest & { id: string }) | null {
  const requests = loadRequests();
  const entries = Object.entries(requests);
  if (entries.length === 0) return null;
  const [id, req] = entries[entries.length - 1];
  return { ...req, id };
}

/** Count pending meeting requests. */
export function getMeetingRequestCount(): number {
  const requests = loadRequests();
  return Object.keys(requests).length;
}

export function removeMeetingRequest(id: string): MeetingRequest | null {
  const requests = loadRequests();
  const upper = id.toUpperCase();
  const req = requests[upper] || null;
  if (req) {
    delete requests[upper];
    saveRequests(requests);
  }
  return req;
}

// --- Approved meetings tracking ---

interface ApprovedMeeting {
  requesterChatId: string;
  requesterName: string;
  topic: string;
  approvedTime?: string;
  approvedAt: string;
}

function loadApproved(): Record<string, ApprovedMeeting> {
  try {
    const raw = require("fs").readFileSync(statePath("approved-meetings.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveApproved(data: Record<string, ApprovedMeeting>): void {
  writeFileSync(statePath("approved-meetings.json"), JSON.stringify(data, null, 2), "utf-8");
}

/** Mark a meeting as approved by Rani. */
export function approveMeeting(id: string, approvedTime?: string): void {
  const req = getMeetingRequestById(id);
  if (!req) return;
  const approved = loadApproved();
  approved[id] = {
    requesterChatId: req.requesterChatId,
    requesterName: req.requesterName,
    topic: req.topic,
    approvedTime,
    approvedAt: new Date().toISOString(),
  };
  saveApproved(approved);
  removeMeetingRequest(id);
}

/** Check if a chat has an approved (not yet completed) meeting. */
export function isApprovedMeeting(chatId: string): boolean {
  const approved = loadApproved();
  return Object.values(approved).some((m) => m.requesterChatId === chatId);
}

/** Get approved meeting for a chat. */
export function getApprovedMeeting(chatId: string): ApprovedMeeting | null {
  const approved = loadApproved();
  return Object.values(approved).find((m) => m.requesterChatId === chatId) || null;
}

/** Remove approved meeting after invite is sent. */
export function completeApprovedMeeting(chatId: string): void {
  const approved = loadApproved();
  for (const [id, m] of Object.entries(approved)) {
    if (m.requesterChatId === chatId) {
      delete approved[id];
    }
  }
  saveApproved(approved);
}

function generateMeetingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "M"; // prefix to distinguish from contact codes
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
