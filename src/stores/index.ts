/**
 * Store provider.
 * Returns singleton instances of each store.
 * To swap backends: replace the implementations here.
 */
export type {
  IApprovalStore,
  IMeetingRequestStore,
  IMeetingStore,
  IConversationStore,
  PendingEntry,
  PendingEntryWithCode,
  MeetingRequest,
  MeetingRequestWithId,
  ConversationMessage,
} from "./types";

import { FileApprovalStore } from "./file-approval-store";
import { FileMeetingRequestStore } from "./file-meeting-store";
import { FileConversationStore } from "./file-conversation-store";

// Singleton instances — swap these to change backend
export const approvalStore = new FileApprovalStore();
export const meetingStore = new FileMeetingRequestStore();
export const conversationStore = new FileConversationStore();
