// Backward-compatible re-exports from the ai module.
// All consumers that import from "./ai" continue to work unchanged.

// Types
export type { Message, SenderContext } from "./types";

// Client
export { client, withRetry } from "./client";

// Callbacks
export {
  setNotifyOwnerCallback,
  setSendMessageCallback,
  setSendFileCallback,
  getNotifyOwnerCallback,
  getSendMessageCallback,
  getSendFileCallback,
} from "./callbacks";

// Core functions
export { sendMessage } from "./send-message";
export { extractFacts } from "./extract-facts";
