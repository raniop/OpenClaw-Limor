/**
 * File-based implementation of IApprovalStore.
 * Delegates to the existing pairing.ts module — no logic duplication.
 */
import type { IApprovalStore, PendingEntry, PendingEntryWithCode } from "./types";
import {
  isApproved,
  addApproved,
  removeApproved,
  isPending,
  addPending,
  approveByCode,
  rejectByCode,
  getLastPending,
  getPendingCount,
} from "../pairing";

export class FileApprovalStore implements IApprovalStore {
  isApproved(chatId: string): boolean {
    return isApproved(chatId);
  }

  addApproved(chatId: string): void {
    addApproved(chatId);
  }

  removeApproved(chatId: string): boolean {
    return removeApproved(chatId);
  }

  isPending(chatId: string): boolean {
    return isPending(chatId);
  }

  addPending(chatId: string, phone: string): string {
    return addPending(chatId, phone);
  }

  approveByCode(code: string): PendingEntry | null {
    return approveByCode(code);
  }

  rejectByCode(code: string): PendingEntry | null {
    return rejectByCode(code);
  }

  getLastPending(): PendingEntryWithCode | null {
    return getLastPending();
  }

  getPendingCount(): number {
    return getPendingCount();
  }
}
