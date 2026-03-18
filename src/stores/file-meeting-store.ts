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
}
