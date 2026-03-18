/**
 * Parse and dispatch AI response — handles [SKIP], [REACT:emoji], and plain text.
 */
import { conversationStore } from "../stores";
import { log } from "../logger";
import type { TraceContext } from "../observability";

/**
 * Send the AI's response back to WhatsApp, handling special formats.
 */
export async function handleResponse(
  chatId: string,
  contactName: string,
  response: string,
  reply: (text: string) => Promise<void>,
  react: (emoji: string) => Promise<void>,
  trace?: TraceContext
): Promise<void> {
  if (response.trim() === "[SKIP]") {
    log.msgSkipGroup(contactName, trace);
    return;
  }

  const reactOnlyMatch = response.match(/^\[REACT:(.+?)\]$/);
  if (reactOnlyMatch) {
    const emoji = reactOnlyMatch[1];
    await react(emoji);
    log.msgReact(emoji, contactName, trace);
    return;
  }

  const reactTextMatch = response.match(/^\[REACT:(.+?)\]\s*([\s\S]+)$/);
  if (reactTextMatch) {
    const emoji = reactTextMatch[1];
    const text = reactTextMatch[2].trim();
    await react(emoji);
    conversationStore.addMessage(chatId, "assistant", text);
    await reply(text);
    log.msgReact(emoji, contactName, trace);
    return;
  }

  conversationStore.addMessage(chatId, "assistant", response);
  await reply(response);
}
