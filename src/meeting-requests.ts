import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

interface MeetingRequest {
  requesterChatId: string;
  requesterName: string;
  topic: string;
  preferredTime?: string;
  createdAt: string;
}

const REQUESTS_PATH = resolve(__dirname, "..", "workspace", "state", "active_tasks.json");

function loadRequests(): Record<string, MeetingRequest> {
  if (!existsSync(REQUESTS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REQUESTS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRequests(data: Record<string, MeetingRequest>): void {
  writeFileSync(REQUESTS_PATH, JSON.stringify(data, null, 2), "utf-8");
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

function generateMeetingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "M"; // prefix to distinguish from contact codes
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
