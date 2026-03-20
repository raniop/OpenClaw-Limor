/**
 * File-based implementation of IMeetingRequestStore.
 * Delegates to the existing meeting-requests.ts module — no logic duplication.
 */
import type { IMeetingRequestStore, MeetingRequest, MeetingRequestWithId } from "./types";
import {
  hasPendingRequest,
  addMeetingRequest,
  getMeetingRequestById,
  getLastMeetingRequest,
  getMeetingRequestCount,
  removeMeetingRequest,
  isApprovedMeeting,
  getApprovedMeeting,
  approveMeeting,
  completeApprovedMeeting,
} from "../meeting-requests";

export class FileMeetingRequestStore implements IMeetingRequestStore {
  hasPendingRequest(requesterChatId: string): boolean {
    return hasPendingRequest(requesterChatId);
  }

  addMeetingRequest(
    requesterChatId: string,
    requesterName: string,
    topic: string,
    preferredTime?: string
  ): string {
    return addMeetingRequest(requesterChatId, requesterName, topic, preferredTime);
  }

  getMeetingRequestById(id: string): MeetingRequestWithId | null {
    return getMeetingRequestById(id);
  }

  getLastMeetingRequest(): MeetingRequestWithId | null {
    return getLastMeetingRequest();
  }

  getMeetingRequestCount(): number {
    return getMeetingRequestCount();
  }

  removeMeetingRequest(id: string): MeetingRequest | null {
    return removeMeetingRequest(id);
  }

  isApproved(chatId: string): boolean {
    return isApprovedMeeting(chatId);
  }

  getApprovedMeeting(chatId: string): { approvedTime?: string } | null {
    return getApprovedMeeting(chatId);
  }

  approveMeeting(id: string, approvedTime?: string): void {
    approveMeeting(id, approvedTime);
  }

  completeApprovedMeeting(chatId: string): void {
    completeApprovedMeeting(chatId);
  }
}
