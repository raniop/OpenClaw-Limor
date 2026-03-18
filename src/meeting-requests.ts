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
  const id = Date.now().toString();
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

export function getLastMeetingRequest(): (MeetingRequest & { id: string }) | null {
  const requests = loadRequests();
  const entries = Object.entries(requests);
  if (entries.length === 0) return null;
  const [id, req] = entries[entries.length - 1];
  return { ...req, id };
}

export function removeMeetingRequest(id: string): MeetingRequest | null {
  const requests = loadRequests();
  const req = requests[id] || null;
  if (req) {
    delete requests[id];
    saveRequests(requests);
  }
  return req;
}
