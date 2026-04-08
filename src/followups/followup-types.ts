/**
 * Follow-up entry type definitions.
 */
export interface FollowupEntry {
  id: string;
  chatId: string;
  contactName: string;
  reason: string;
  dueAt: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  status: "pending" | "completed";
  requesterChatId?: string; // chatId of person who requested (for auto-notify on complete)
  requesterName?: string;   // name of requester
  targetChatId?: string;    // who to notify when due (if not set → owner)
  targetName?: string;      // display name of target contact
  targetMessage?: string;   // custom message to send to target
}
