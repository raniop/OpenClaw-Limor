/**
 * File-based meeting store v2.
 * Delegates entirely to the meeting state machine.
 * Provides backward-compatible interface for existing consumers.
 */
import type { IMeetingStore, MeetingRequestWithId } from "./types";
import {
  hasPendingMeeting,
  createMeetingRequest,
  approveMeeting,
  rejectMeeting,
  getMeetingById,
  getLastMeetingRequest,
  getPendingMeetingCount,
} from "../meetings/meeting-state";

export class FileMeetingRequestStore implements IMeetingStore {
  hasPendingRequest(requesterChatId: string): boolean {
    return hasPendingMeeting(requesterChatId);
  }

  async createRequest(
    chatId: string,
    contactName: string,
    topic: string,
    preferredTime?: string
  ): Promise<{ id: string; alreadyPending: boolean }> {
    return createMeetingRequest(chatId, contactName, topic, preferredTime);
  }

  async approve(
    id: string,
    date?: string,
    time?: string
  ): Promise<{ success: boolean; error?: string; needsDateTime?: boolean }> {
    return approveMeeting(id, date, time);
  }

  async reject(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    return rejectMeeting(id, reason);
  }

  getMeetingById(id: string): MeetingRequestWithId | null {
    const m = getMeetingById(id);
    if (!m) return null;
    return {
      id: m.id,
      requesterChatId: m.chatId,
      requesterName: m.contactName,
      topic: m.topic,
      preferredTime: m.preferredTime,
      createdAt: m.createdAt,
    };
  }

  /** @deprecated Use getMeetingById */
  getMeetingRequestById(id: string): MeetingRequestWithId | null {
    return this.getMeetingById(id);
  }

  getLastMeetingRequest(): MeetingRequestWithId | null {
    const m = getLastMeetingRequest();
    if (!m) return null;
    return {
      id: m.id,
      requesterChatId: m.chatId,
      requesterName: m.contactName,
      topic: m.topic,
      preferredTime: m.preferredTime,
      createdAt: m.createdAt,
    };
  }

  getMeetingRequestCount(): number {
    return getPendingMeetingCount();
  }

  /** @deprecated No longer needed — state machine handles removal via state transitions */
  removeMeetingRequest(_id: string): null {
    return null;
  }

  /** @deprecated Use approve/reject instead */
  approveMeeting(_id: string, _approvedTime?: string): void {
    // No-op — use approve() instead
  }

  /** @deprecated */
  isApproved(_chatId: string): boolean {
    return false;
  }

  /** @deprecated */
  getApprovedMeeting(_chatId: string): null {
    return null;
  }

  /** @deprecated */
  completeApprovedMeeting(_chatId: string): void {
    // No-op
  }
}
