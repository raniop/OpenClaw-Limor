/**
 * Hallucination detection and retry logic.
 * Detects when the AI claims it performed an action without actually calling a tool,
 * then retries with explicit instructions to use tools.
 */
import Anthropic from "@anthropic-ai/sdk";
import { client, withRetry } from "./client";
import { config } from "../config";
import { handleToolCall } from "./handle-tool-call";
import { log } from "../logger";
import { startTimer } from "../observability";
import type { SenderContext } from "./types";
import { getNotifyOwnerCallback } from "./callbacks";

const MAX_TOOL_ITERATIONS = 15;

export interface HallucinationCheckResult {
  isHallucination: boolean;
  claimedAction: string | null;
}

const HALLUCINATION_PATTERN = /שולחת בקשה|שלחתי בקשה|שולחת לרני|העברתי לרני|קבעתי|שלחתי זימון|שולחת זימון|שלחתי הודעה|שלחתי ל|העברתי ל|בדקתי את|מצאתי (מסעדה|טיסה|מלון)|הזמנתי|ביטלתי|יצרתי|נוצרה|הוספתי|מחקתי|החלפתי|עברתי ל|שיניתי|עדכנתי|בוצע|הופעל|הוגדר|נשמר|הועבר/;
// Detect when Limor mentions an agent by name without actually delegating
const AGENT_REFERENCE_PATTERN = /בוריס (בדק|מצא|דיווח|זיהה|החזיר)|מיכל (סיכמה|מצאה|החזירה)|רונית (חיפשה|מצאה|בדקה)|נועה (ניתחה|בדקה|מצאה)|יעל (יצרה|הגדירה)|טל (בדקה|זיהתה|מצאה)|מאיה (הפעילה|כיבתה|הדליקה)|עדי (קבעה|מחקה|בדקה)|הילה (מצאה|הזמינה|חיפשה)|דנה (מצאה|השוותה|חיפשה)/;

/**
 * Check whether the AI response is a hallucination — claiming an action without
 * having called any tool.
 */
export function checkHallucination(
  response: string,
  hadToolCalls: boolean,
  toolsAvailable: boolean,
  userMessage?: string
): HallucinationCheckResult {
  if (hadToolCalls || !toolsAvailable) {
    return { isHallucination: false, claimedAction: null };
  }

  // Skip hallucination check when the system already performed an action
  // (e.g., PDF bill/contract was auto-saved by media-handler before AI)
  if (userMessage && userMessage.includes("[מערכת:")) {
    return { isHallucination: false, claimedAction: null };
  }

  // Check for agent name references without delegation
  const agentMatch = AGENT_REFERENCE_PATTERN.exec(response);
  if (agentMatch) {
    return { isHallucination: true, claimedAction: agentMatch[0] };
  }

  const match = HALLUCINATION_PATTERN.exec(response);
  if (!match) {
    return { isHallucination: false, claimedAction: null };
  }

  return { isHallucination: true, claimedAction: match[0] };
}

/**
 * Retry the AI call after detecting a hallucination.
 * Appends a correction message and runs a full tool loop on the retry.
 * Returns the new response text, or null if the retry fails.
 */
export async function retryOnHallucination(
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  tools: Anthropic.Tool[],
  model: string,
  originalResponse: Anthropic.ContentBlock[],
  sender?: SenderContext
): Promise<string | null> {
  // Append the hallucinated response + correction instruction
  messages.push({ role: "assistant", content: originalResponse });
  messages.push({
    role: "user",
    content: "[SYSTEM] שגיאה: טענת שביצעת פעולה בלי להפעיל כלי. אנא נסי שוב — הפעם חובה להשתמש בכלי המתאים. אם אין כלי מתאים, אמרי בכנות שאין לך יכולת.",
  });

  const retryParams: any = {
    model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages,
  };
  if (tools.length > 0) retryParams.tools = tools;

  try {
    let retryResponse = await withRetry(() => client.messages.create(retryParams));

    // Run tool loop on the retry too (AI might now actually call a tool)
    let iterations = 0;
    while (retryResponse.stop_reason === "tool_use") {
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
      const retryToolBlocks = retryResponse.content.filter(
        (b) => b.type === "tool_use"
      ) as Anthropic.ToolUseBlock[];
      if (retryToolBlocks.length === 0) break;

      const retryToolResults = await Promise.all(
        retryToolBlocks.map(async (toolBlock) => {
          const timer = startTimer();
          const result = await handleToolCall(
            toolBlock.name,
            toolBlock.input as Record<string, any>,
            sender
          );
          log.toolCall(toolBlock.name, result, timer.stop());
          return { id: toolBlock.id, name: toolBlock.name, result };
        })
      );

      messages.push({ role: "assistant", content: retryResponse.content });
      messages.push({
        role: "user",
        content: retryToolResults.map((tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.id,
          content: tr.result,
        })),
      });

      const retryLoopParams: any = {
        model,
        max_tokens: config.maxTokens,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages,
      };
      if (tools.length > 0) retryLoopParams.tools = tools;

      retryResponse = await withRetry(() => client.messages.create(retryLoopParams));
    }

    const textBlock = retryResponse.content.find((block) => block.type === "text");
    const newText = textBlock ? (textBlock as Anthropic.TextBlock).text : null;
    console.log(`[hallucination-guard] Retry completed. New text: ${newText?.substring(0, 200)}`);
    return newText;
  } catch (retryErr) {
    console.error("[hallucination-guard] Retry failed:", retryErr);
    return null;
  }
}

/**
 * Notify the owner about a hallucination event (best-effort, never throws).
 */
export function notifyHallucinationEvent(sender?: SenderContext): void {
  try {
    const notify = getNotifyOwnerCallback();
    if (notify) {
      const who = sender?.isOwner ? "בשיחה איתך" : `צ'אט: ${sender?.name || "unknown"}`;
      notify(`⚠️ [hallucination] ${config.botName} טענה שביצעה פעולה בלי tool! (retry triggered)\n${who}`).catch(() => {});
    }
  } catch {}
}
