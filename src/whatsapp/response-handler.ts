/**
 * Parse and dispatch AI response — handles [SKIP], [REACT:emoji], and plain text.
 * Supports voice responses: when the original message was a voice note and the
 * response is short, sends a voice message in addition to the text reply.
 */
import { conversationStore } from "../stores";
import { log } from "../logger";
import type { TraceContext } from "../observability";
import { textToVoice } from "./voice-response";

/** Max text length for voice response (longer texts sound bad as voice notes) */
const VOICE_MAX_CHARS = 200;

/**
 * If conditions are met, generate and send a voice note alongside the text.
 */
async function trySendVoice(
  text: string,
  sendVoice: ((base64: string, mimetype: string) => Promise<void>) | undefined
): Promise<void> {
  if (!sendVoice) return;
  if (text.length > VOICE_MAX_CHARS) return;

  try {
    const result = await textToVoice(text);
    if (result) {
      const base64 = result.buffer.toString("base64");
      await sendVoice(base64, result.mimetype);
      console.log(`[voice] Sent voice response (${text.length} chars)`);
    }
  } catch (err) {
    // Voice is best-effort — never fail the text response
    console.error("[voice] Failed to send voice response:", err);
  }
}

/**
 * Send the AI's response back to WhatsApp, handling special formats.
 * When isVoice is true and sendVoice is provided, also sends the response as a voice note.
 */
export async function handleResponse(
  chatId: string,
  contactName: string,
  response: string,
  reply: (text: string) => Promise<void>,
  react: (emoji: string) => Promise<void>,
  trace?: TraceContext,
  options?: {
    isVoice?: boolean;
    sendVoice?: (base64: string, mimetype: string) => Promise<void>;
  }
): Promise<void> {
  if (response.trim().startsWith("[SKIP]")) {
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
    if (options?.isVoice) await trySendVoice(text, options.sendVoice);
    log.msgReact(emoji, contactName, trace);
    return;
  }

  conversationStore.addMessage(chatId, "assistant", response);
  await reply(response);
  if (options?.isVoice) await trySendVoice(response, options.sendVoice);
}
