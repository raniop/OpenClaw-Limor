/**
 * File-based implementation of IConversationStore.
 * Delegates to the existing conversation.ts module — no logic duplication.
 */
import type { IConversationStore, ConversationMessage } from "./types";
import {
  addMessage,
  getHistory,
  clearHistory,
} from "../conversation";

export class FileConversationStore implements IConversationStore {
  addMessage(chatId: string, role: "user" | "assistant", content: string): void {
    addMessage(chatId, role, content);
  }

  getHistory(chatId: string): ConversationMessage[] {
    return getHistory(chatId);
  }

  clearHistory(chatId: string): void {
    clearHistory(chatId);
  }
}
