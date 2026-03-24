/**
 * Meeting State Machine.
 * Enforces meeting lifecycle in CODE, not AI prompts.
 * States: requested → owner_notified → approved → event_created → contact_notified → completed
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "../config";
import { statePath } from "../state-dir";
import { createEvent } from "../calendar";
import { getNotifyOwnerCallback, getSendMessageCallback } from "../ai/callbacks";
import { logAudit } from "../audit/audit-log";
import { parseHebrewTime } from "./time-parser";

// --- Types ---

export type MeetingState =
  | "requested"
  | "owner_notified"
  | "approved"
  | "event_created"
  | "contact_notified"
  | "completed"
  | "rejected"
  | "cancelled";

export interface MeetingRequest {
  id: string;
  chatId: string;
  contactName: string;
  topic: string;
  preferredTime?: string;
  parsedDate?: string;
  parsedTime?: string;
  state: MeetingState;
  ownerApprovedAt?: string;
  approvedDate?: string;
  approvedTime?: string;
  eventId?: string;
  contactNotifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Storage ---

const MEETINGS_FILE = "meetings.json";

function getMeetingsPath(): string {
  return statePath(MEETINGS_FILE);
}

function loadMeetings(): Record<string, MeetingRequest> {
  const path = getMeetingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function saveMeetings(data: Record<string, MeetingRequest>): void {
  const path = getMeetingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function generateMeetingId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "M";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// --- State Machine Functions ---

/**
 * Create a new meeting request and auto-notify the owner.
 * Transitions: → requested → owner_notified
 */
export async function createMeetingRequest(
  chatId: string,
  contactName: string,
  topic: string,
  preferredTime?: string
): Promise<{ id: string; alreadyPending: boolean }> {
  const meetings = loadMeetings();

  // Check for duplicate: same chatId with a pending meeting
  const existing = Object.values(meetings).find(
    (m) =>
      m.chatId === chatId &&
      !["completed", "rejected", "cancelled"].includes(m.state)
  );
  if (existing) {
    return { id: existing.id, alreadyPending: true };
  }

  // Parse preferred time
  let parsedDate: string | undefined;
  let parsedTime: string | undefined;
  if (preferredTime) {
    const parsed = parseHebrewTime(preferredTime);
    if (parsed) {
      parsedDate = parsed.date;
      parsedTime = parsed.time;
    }
  }

  const id = generateMeetingId();
  const now = new Date().toISOString();

  const meeting: MeetingRequest = {
    id,
    chatId,
    contactName,
    topic,
    preferredTime,
    parsedDate,
    parsedTime,
    state: "requested",
    createdAt: now,
    updatedAt: now,
  };

  meetings[id] = meeting;
  saveMeetings(meetings);

  // Auto-transition to owner_notified
  await notifyOwnerOfMeeting(meeting);

  logAudit(contactName, "meeting_request", id, "created");

  return { id, alreadyPending: false };
}

/**
 * Notify owner about a meeting request.
 * Transitions: requested → owner_notified
 */
async function notifyOwnerOfMeeting(meeting: MeetingRequest): Promise<void> {
  const timeInfo = meeting.preferredTime
    ? `\n⏰ זמן מועדף: ${meeting.preferredTime}`
    : "";

  const ownerMsg = `📅 בקשת פגישה חדשה! (${meeting.id})\n👤 ${meeting.contactName} רוצה לקבוע פגישה עם ${config.ownerName}\n📋 נושא: ${meeting.topic}${timeInfo}\n\n✅ לאשר: *אשר פגישה ${meeting.id}*\nלאשר עם זמן: *אשר פגישה ${meeting.id} מחר ב-14:00*\n❌ לדחות: *דחה פגישה ${meeting.id}*`;

  const notifyOwner = getNotifyOwnerCallback();
  if (notifyOwner) {
    try {
      await notifyOwner(ownerMsg);
    } catch (err) {
      console.error("[meeting-state] Failed to notify owner:", err);
    }
  }

  // Update state
  const meetings = loadMeetings();
  if (meetings[meeting.id]) {
    meetings[meeting.id].state = "owner_notified";
    meetings[meeting.id].updatedAt = new Date().toISOString();
    saveMeetings(meetings);
  }
}

/**
 * Approve a meeting — creates calendar event and notifies contact.
 * Transitions: owner_notified → approved → event_created → contact_notified → completed
 * All steps happen atomically in code.
 */
export async function approveMeeting(
  id: string,
  date?: string,
  time?: string
): Promise<{ success: boolean; error?: string; needsDateTime?: boolean }> {
  const meetings = loadMeetings();
  const meeting = meetings[id];

  if (!meeting) {
    return { success: false, error: `לא מצאתי בקשת פגישה עם מזהה ${id}` };
  }

  if (["completed", "rejected", "cancelled"].includes(meeting.state)) {
    return { success: false, error: `בקשת הפגישה ${id} כבר טופלה (${meeting.state})` };
  }

  // Determine date and time
  const finalDate = date || meeting.parsedDate;
  const finalTime = time || meeting.parsedTime;

  if (!finalDate || !finalTime) {
    return {
      success: false,
      needsDateTime: true,
      error: "חסר תאריך או שעה. ענה עם: *אשר פגישה " + id + " [תאריך] ב-[שעה]*",
    };
  }

  // Transition to approved
  meeting.state = "approved";
  meeting.ownerApprovedAt = new Date().toISOString();
  meeting.approvedDate = finalDate;
  meeting.approvedTime = finalTime;
  meeting.updatedAt = new Date().toISOString();
  saveMeetings(meetings);

  // Create calendar event
  try {
    const startDate = new Date(`${finalDate}T${finalTime}:00`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour default
    const title = `פגישה עם ${meeting.contactName} - ${meeting.topic}`;

    const eventResult = await createEvent(title, startDate, endDate);

    meeting.eventId = eventResult.eventId;
    meeting.state = "event_created";
    meeting.updatedAt = new Date().toISOString();
    saveMeetings(meetings);

    logAudit(config.ownerName, "meeting_approved", id, "event_created", {
      date: finalDate,
      time: finalTime,
      eventId: eventResult.eventId,
    });
  } catch (err: any) {
    console.error("[meeting-state] Failed to create calendar event:", err);
    // Revert to owner_notified state
    meeting.state = "owner_notified";
    meeting.updatedAt = new Date().toISOString();
    saveMeetings(meetings);
    return { success: false, error: `נכשל ביצירת אירוע ביומן: ${err.message}` };
  }

  // Notify contact
  try {
    const sendMessage = getSendMessageCallback();
    if (sendMessage) {
      const dateFormatted = new Date(`${finalDate}T${finalTime}:00`).toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const contactMsg = `היי ${meeting.contactName}! 🎉\n${config.ownerName} אישר את הפגישה!\n📅 ${dateFormatted} בשעה ${finalTime}\n📋 נושא: ${meeting.topic}\n\nנתראה! 😊`;
      await sendMessage(meeting.chatId, contactMsg);

      meeting.state = "contact_notified";
      meeting.contactNotifiedAt = new Date().toISOString();
      meeting.updatedAt = new Date().toISOString();
      saveMeetings(meetings);
    }
  } catch (err) {
    console.error("[meeting-state] Failed to notify contact:", err);
    // Event was created, but notification failed. Mark as event_created (not rolled back).
  }

  // Mark completed
  meeting.state = "completed";
  meeting.updatedAt = new Date().toISOString();
  saveMeetings(meetings);

  return { success: true };
}

/**
 * Reject a meeting and notify the contact.
 * Transitions: any pending → rejected
 */
export async function rejectMeeting(
  id: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const meetings = loadMeetings();
  const meeting = meetings[id];

  if (!meeting) {
    return { success: false, error: `לא מצאתי בקשת פגישה עם מזהה ${id}` };
  }

  if (["completed", "rejected", "cancelled"].includes(meeting.state)) {
    return { success: false, error: `בקשת הפגישה ${id} כבר טופלה (${meeting.state})` };
  }

  meeting.state = "rejected";
  meeting.rejectionReason = reason;
  meeting.updatedAt = new Date().toISOString();
  saveMeetings(meetings);

  // Notify contact
  try {
    const sendMessage = getSendMessageCallback();
    if (sendMessage) {
      const contactMsg = reason
        ? `היי ${meeting.contactName}, לצערי ${config.ownerName} לא יכול לקבוע פגישה כרגע. ${reason}`
        : `היי ${meeting.contactName}, לצערי ${config.ownerName} לא יכול בזמן הזה. אפשר לנסות מועד אחר 🙏`;
      await sendMessage(meeting.chatId, contactMsg);
    }
  } catch (err) {
    console.error("[meeting-state] Failed to notify contact of rejection:", err);
  }

  logAudit(config.ownerName, "meeting_rejected", id, "rejected");

  return { success: true };
}

// --- Query Functions ---

/**
 * Get all meetings for a specific contact.
 */
export function getMeetingsByContact(chatId: string): MeetingRequest[] {
  const meetings = loadMeetings();
  return Object.values(meetings).filter((m) => m.chatId === chatId);
}

/**
 * Get all pending meetings (requested or owner_notified).
 */
export function getPendingMeetings(): MeetingRequest[] {
  const meetings = loadMeetings();
  return Object.values(meetings).filter((m) =>
    ["requested", "owner_notified", "approved"].includes(m.state)
  );
}

/**
 * Get the most recent non-completed meeting for a chat.
 */
export function getActiveMeeting(chatId: string): MeetingRequest | null {
  const meetings = loadMeetings();
  const active = Object.values(meetings)
    .filter(
      (m) =>
        m.chatId === chatId &&
        !["completed", "rejected", "cancelled"].includes(m.state)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return active[0] || null;
}

/**
 * Get a meeting by ID.
 */
export function getMeetingById(id: string): MeetingRequest | null {
  const meetings = loadMeetings();
  const upper = id.toUpperCase();
  return meetings[upper] || null;
}

/**
 * Get count of pending meetings.
 */
export function getPendingMeetingCount(): number {
  return getPendingMeetings().length;
}

/**
 * Get the last (most recent) meeting request.
 */
export function getLastMeetingRequest(): MeetingRequest | null {
  const meetings = loadMeetings();
  const all = Object.values(meetings).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return all[0] || null;
}

/**
 * Check if a chat has a pending (non-terminal) meeting.
 */
export function hasPendingMeeting(chatId: string): boolean {
  return getActiveMeeting(chatId) !== null;
}
