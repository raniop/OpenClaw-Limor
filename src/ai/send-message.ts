/**
 * Core message sending function.
 * Thin orchestration layer — delegates to prompt-builder, guards, model-router.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { client, withRetry } from "./client";
import type { Message, SenderContext } from "./types";
import {
  calendarTools, travelTools, bookingTools,
  crmTools, instructionTools, fileTools, contactTools, smartHomeTools, capabilityTools, modelTools, codingTools, gettTools, whatsappExtraTools, smsTools, webSearchTools,
} from "./tools";
import { handleToolCall } from "./handle-tool-call";
import { selectModel } from "./model-router";
import type { ModelRouterParams } from "./model-router";
import { log } from "../logger";
import { startTimer } from "../observability";
import { buildSystemPrompt } from "./prompt-builder";
import { checkHallucination, retryOnHallucination, notifyHallucinationEvent } from "./guards";
import { getNotifyOwnerCallback } from "./callbacks";

const MAX_TOOL_ITERATIONS = 15;
const SEND_MESSAGE_TIMEOUT_MS = 90_000;

export interface SendMessageOptions {
  /** When false, tools are stripped from the API call to prevent execution. Default: true. */
  allowTools?: boolean;
  /** When provided and non-empty, filter tools to only these names. Empty array = no tools. */
  allowedToolNames?: string[];
  /** Model routing parameters — when provided, selectModel() picks the model. */
  modelRouting?: ModelRouterParams;
}

export interface SendMessageResult {
  text: string;
  toolsUsed: string[];
}

export async function sendMessage(
  history: Message[],
  memoryContext?: string,
  sender?: SenderContext,
  options?: SendMessageOptions
): Promise<SendMessageResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("__SEND_MESSAGE_TIMEOUT__")), SEND_MESSAGE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([timeoutPromise, (async () => {
  // --- Build system prompt ---
  const lastUserMsg = history.filter((m) => m.role === "user").pop()?.content || "";
  const isGroup = !!(sender && !sender.isOwner && sender.chatId.endsWith("@g.us"));

  const { systemPrompt, policySummary } = buildSystemPrompt({
    memoryContext,
    lastUserMessage: lastUserMsg,
    isOwner: !!sender?.isOwner,
    isGroup,
    sender,
  });
  console.log(`[send-message] ${policySummary}`);

  // --- Build messages array ---
  const messages: Anthropic.MessageParam[] = history.map((m) => {
    if (m.role === "user" && m.imageData) {
      return {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: m.imageData.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: m.imageData.base64,
            },
          },
          { type: "text" as const, text: m.content || "מה יש בתמונה?" },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  // --- Assemble tools based on permissions ---
  const toolsEnabled = options?.allowTools !== false;
  let tools = !toolsEnabled
    ? []
    : sender?.isOwner
      ? [...calendarTools, ...travelTools, ...bookingTools, ...crmTools, ...instructionTools, ...fileTools, ...contactTools, ...smartHomeTools, ...capabilityTools, ...modelTools, ...codingTools, ...gettTools, ...whatsappExtraTools, ...smsTools, ...webSearchTools]
      : [...calendarTools, ...travelTools, ...bookingTools, ...webSearchTools];

  if (toolsEnabled && options?.allowedToolNames && options.allowedToolNames.length > 0) {
    const allowed = new Set(options.allowedToolNames);
    tools = tools.filter((t) => allowed.has(t.name));
  }

  console.log(`[send-message] Tools: ${tools.length} | allowTools=${options?.allowTools} | allowedNames=${options?.allowedToolNames?.length ?? 'none'} | names=${tools.map(t=>t.name).join(',')}`);

  // --- Select model ---
  let selectedModel = config.model;
  if (options?.modelRouting) {
    const selection = selectModel(options.modelRouting);
    selectedModel = selection.model;
    console.log(`[model-router] Selected: ${selection.model} (${selection.reason})`);
  }

  // --- Initial API call (with prompt caching) ---
  const apiParams: any = {
    model: selectedModel,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (tools.length > 0) apiParams.tools = tools;

  let response = await withRetry(() => client.messages.create(apiParams));

  // --- Tool use loop ---
  const loopResult = await runToolLoop(response, messages, systemPrompt, tools, selectedModel, sender);
  response = loopResult.response;
  const toolsUsed = loopResult.toolsUsed;

  // --- Extract text ---
  const textBlock = response.content.find((block) => block.type === "text");
  let finalText = textBlock ? (textBlock as Anthropic.TextBlock).text : "אופס, לא הצלחתי לייצר תשובה 😅 נסה שוב?";

  // --- Hallucination guard ---
  const hadToolCalls = toolsUsed.length > 0 || response.content.some((b) => b.type === "tool_use") ||
    messages.some((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));

  const hallCheck = checkHallucination(finalText, hadToolCalls, tools.length > 0);

  if (hallCheck.isHallucination) {
    console.error(`[hallucination-guard] ⚠️ AI claimed action but no tool was called! Retrying once. Text: ${finalText.substring(0, 200)}`);

    const retryText = await retryOnHallucination(
      messages, systemPrompt, tools, selectedModel, response.content, sender
    );
    if (retryText !== null) {
      finalText = retryText;
    }

    notifyHallucinationEvent(sender);
  }

  return { text: finalText, toolsUsed };
    })()]);
  } catch (err: any) {
    if (err?.message === "__SEND_MESSAGE_TIMEOUT__") {
      console.error(`[send-message] ⏰ Timeout after ${SEND_MESSAGE_TIMEOUT_MS}ms`);
      return { text: "⏰ הפעולה לקחה יותר מדי זמן. נסה שוב עם בקשה פשוטה יותר?", toolsUsed: [] };
    }
    throw err;
  }
}

// ─── Tool loop helper ────────────────────────────────────────────────

interface ToolLoopResult {
  response: Anthropic.Message;
  toolsUsed: string[];
}

async function runToolLoop(
  response: Anthropic.Message,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: Anthropic.Tool[],
  model: string,
  sender?: SenderContext
): Promise<ToolLoopResult> {
  const toolRetries = new Map<string, number>();
  const toolsUsed: string[] = [];
  let iterations = 0;

  while (response.stop_reason === "tool_use") {
    iterations++;
    if (iterations > MAX_TOOL_ITERATIONS) {
      console.warn(`[send-message] ⚠️ Tool loop hit max iterations (${MAX_TOOL_ITERATIONS}), forcing stop.`);
      try {
        const notify = getNotifyOwnerCallback();
        if (notify) {
          const who = sender?.isOwner ? "בשיחה איתך" : `צ'אט: ${sender?.name || "unknown"}`;
          notify(`⚠️ [tool-loop] הגעתי למגבלת iterations (${iterations}/${MAX_TOOL_ITERATIONS})\n${who}`).catch(() => {});
        }
      } catch {}
      break;
    }
    const toolBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolBlocks.length === 0) break;

    const toolResults = await Promise.all(
      toolBlocks.map(async (toolBlock) => {
        const timer = startTimer();
        const result = await handleToolCall(
          toolBlock.name,
          toolBlock.input as Record<string, any>,
          sender
        );
        log.toolCall(toolBlock.name, result, timer.stop());
        toolsUsed.push(toolBlock.name);
        return { id: toolBlock.id, name: toolBlock.name, result };
      })
    );

    const toolResultContent = toolResults.map((tr) => {
      const isError = tr.result.includes("\u274C");
      const retryCount = toolRetries.get(tr.name) || 0;

      if (isError) {
        toolRetries.set(tr.name, retryCount + 1);
      }

      const content = (isError && retryCount === 0)
        ? `${tr.result}\n\n[Tool failed on first attempt — you may retry with different parameters or try a different approach.]`
        : tr.result;

      return {
        type: "tool_result" as const,
        tool_use_id: tr.id,
        content,
      };
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResultContent });

    const loopParams: any = {
      model,
      max_tokens: config.maxTokens,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages,
    };
    if (tools.length > 0) loopParams.tools = tools;

    response = await withRetry(() => client.messages.create(loopParams));
  }

  return { response, toolsUsed };
}
