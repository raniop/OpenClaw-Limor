/**
 * Core message sending function.
 * Assembles the system prompt, calls Claude API, runs the tool loop.
 * Extracted from ai-core.ts — exact same logic, no behavior changes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { getRecentContacts } from "../contacts";
import { getInstructionsContext } from "../instructions";
import { getRelevantContext } from "../workspace-loader";
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

export interface SendMessageOptions {
  /** When false, tools are stripped from the API call to prevent execution. Default: true. */
  allowTools?: boolean;
  /** When provided and non-empty, filter tools to only these names. Empty array = no tools. */
  allowedToolNames?: string[];
  /** Model routing parameters — when provided, selectModel() picks the model. */
  modelRouting?: ModelRouterParams;
}

export async function sendMessage(
  history: Message[],
  memoryContext?: string,
  sender?: SenderContext,
  options?: SendMessageOptions
): Promise<string> {
  let systemPrompt = config.systemPrompt;
  if (memoryContext) {
    systemPrompt += "\n\n" + memoryContext;
  }

  // Load owner-defined instructions
  const instructionsContext = getInstructionsContext();
  if (instructionsContext) {
    systemPrompt += "\n\n" + instructionsContext;
  }

  // Selective workspace context based on message content
  const lastUserMsg = history.filter((m) => m.role === "user").pop()?.content || "";
  const isGroup = !!(sender && !sender.isOwner && sender.chatId.endsWith("@g.us"));
  const workspaceContext = getRelevantContext(lastUserMsg, isGroup, !!sender?.isOwner);
  if (workspaceContext) {
    systemPrompt += "\n\n" + workspaceContext;
  }

  // Add current date/time context
  const now = new Date();
  systemPrompt += `\n\nהתאריך והשעה הנוכחיים: ${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}. היום: ${now.toLocaleDateString("he-IL", { weekday: "long" })}.`;

  // Add known contacts list so AI uses exact stored names
  const recentContacts = getRecentContacts(20);
  if (recentContacts.length > 0) {
    const contactsList = recentContacts.map((c) => c.name).join(", ");
    systemPrompt += `\n\nאנשי קשר מוכרים (השתמשי בשמות האלה בדיוק כשמשתמשת ב-send_message): ${contactsList}`;
  }

  // Anti-hallucination rules for calendar — CRITICAL
  systemPrompt += `\n\n🚨 כללים חמורים ביותר — הפרה = כשל קריטי:

1. אם מישהו מבקש פגישה עם רני — חובה להפעיל את הכלי request_meeting בפועל! אסור רק לכתוב "שולחת בקשה" בלי להפעיל את הכלי!
2. אסור בשום מצב לטעון שיש פגישה ביומן בלי להפעיל קודם את list_events!
3. אסור להמציא זמנים או אירועים!
4. אם אתה אומר למשתמש "שולחת בקשה לרני" — חייב להפעיל request_meeting באותו תור! אחרת זה שקר!
5. ⛔ אסור להשתמש ב-create_event עבור אנשים שהם לא רני! המערכת תחסום את זה אוטומטית.
6. אחרי שהפעלת request_meeting — אמרי "שלחתי בקשה לרני, אעדכן אותך!" ולא "קבעתי" או "סידרתי"!`;

  // Add sender context so bot knows who's talking
  if (sender) {
    if (sender.isOwner) {
      systemPrompt += `\n\nהמשתמש הנוכחי: רני (הבעלים שלך). אפשר לקבוע לו אירועים ישירות ביומן. יש לך גם גישה ל-CRM של ביטוח אופיר.`;
      if (config.ownerName && config.ownerPhone) {
        systemPrompt += `\n\n📋 פרטי רני להזמנת מסעדות (השתמשי בהם אוטומטית בלי לשאול!): שם: ${config.ownerName}, טלפון: ${config.ownerPhone}, מייל: ${config.ownerEmail || ""}`;
      }
    } else {
      systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). אם הוא רוצה לקבוע פגישה עם רני – חובה להשתמש ב-request_meeting! המערכת מטפלת בשאר (שליחה לרני, יצירת אירוע, ועדכון חזרה). אסור לקבוע ישירות או לשלוח זימון בלי אישור רני!`;
    }
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => {
    // Build vision content blocks when image data is attached
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

  // Include CRM + instruction + file tools only for owner, travel + booking tools for everyone
  // If allowTools is explicitly false, pass empty tools array to prevent tool execution
  const toolsEnabled = options?.allowTools !== false;
  let tools = !toolsEnabled
    ? []
    : sender?.isOwner
      ? [...calendarTools, ...travelTools, ...bookingTools, ...crmTools, ...instructionTools, ...fileTools, ...contactTools, ...smartHomeTools, ...capabilityTools, ...modelTools, ...codingTools, ...gettTools, ...whatsappExtraTools, ...smsTools, ...webSearchTools]
      : [...calendarTools, ...travelTools, ...bookingTools, ...webSearchTools];

  // Apply tool routing filter — narrow to only allowed tool names
  if (toolsEnabled && options?.allowedToolNames && options.allowedToolNames.length > 0) {
    const allowed = new Set(options.allowedToolNames);
    tools = tools.filter((t) => allowed.has(t.name));
  }

  // Debug: log tool count and names
  console.log(`[send-message] Tools: ${tools.length} | allowTools=${options?.allowTools} | allowedNames=${options?.allowedToolNames?.length ?? 'none'} | names=${tools.map(t=>t.name).join(',')}`);

  // Model routing: pick model based on context, or fall back to config default
  let selectedModel = config.model;
  if (options?.modelRouting) {
    const selection = selectModel(options.modelRouting);
    selectedModel = selection.model;
    console.log(`[model-router] Selected: ${selection.model} (${selection.reason})`);
  }

  // Anti-hallucination enforcement — MUST be the last instruction in the system prompt
  systemPrompt += `\n\n⛔ ENFORCEMENT: You MUST use tools for ANY action. If your response contains ANY of these words: שלחתי, קבעתי, הזמנתי, ביטלתי, מחקתי, יצרתי, הוספתי, העברתי, החלפתי, שמרתי — then you MUST have called a tool in this turn. If you didn't call a tool, rewrite your response to say what you WILL do, not what you DID.`;

  const apiParams: any = {
    model: selectedModel,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
  };
  if (tools.length > 0) apiParams.tools = tools;

  let response = await withRetry(() => client.messages.create(apiParams));

  // Handle tool use loop (supports multiple parallel tool calls)
  // Track retry counts per tool name so failed tools get one retry
  const toolRetries = new Map<string, number>();

  while (response.stop_reason === "tool_use") {
    const toolBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolBlocks.length === 0) break;

    // Execute all tool calls (in parallel) with timing
    const toolResults = await Promise.all(
      toolBlocks.map(async (toolBlock) => {
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

    // Build tool result content, adding retry hint for first-time failures
    const toolResultContent = toolResults.map((tr) => {
      const isError = tr.result.includes("\u274C"); // ❌ character
      const retryCount = toolRetries.get(tr.name) || 0;

      if (isError) {
        toolRetries.set(tr.name, retryCount + 1);
      }

      // On first failure, add hint so Claude tries a different approach
      const content = (isError && retryCount === 0)
        ? `${tr.result}\n\n[Tool failed on first attempt — you may retry with different parameters or try a different approach.]`
        : tr.result;

      return {
        type: "tool_result" as const,
        tool_use_id: tr.id,
        content,
      };
    });

    // Send all tool results back
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResultContent });

    const loopParams: any = {
      model: selectedModel,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages,
    };
    if (tools.length > 0) loopParams.tools = tools;

    response = await withRetry(() => client.messages.create(loopParams));
  }

  let textBlock = response.content.find((block) => block.type === "text");
  let finalText = textBlock ? textBlock.text : "אופס, לא הצלחתי לייצר תשובה 😅 נסה שוב?";

  // Hallucination guard: if AI claims it did something but no tool was called
  const hadToolCalls = response.content.some((b) => b.type === "tool_use") ||
    messages.some((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));

  const hallucinationPattern = /שולחת בקשה|שלחתי בקשה|שולחת לרני|העברתי לרני|קבעתי|שלחתי זימון|שולחת זימון|שלחתי הודעה|שלחתי ל|העברתי ל|בדקתי את|מצאתי (מסעדה|טיסה|מלון)|הזמנתי|ביטלתי|יצרתי|נוצרה|הוספתי|מחקתי|החלפתי|עברתי ל|שיניתי|עדכנתי|בוצע|הופעל|הוגדר|נשמר|הועבר/;

  if (!hadToolCalls && tools.length > 0 && hallucinationPattern.test(finalText)) {
    console.error(`[hallucination-guard] ⚠️ AI claimed action but no tool was called! Retrying once. Text: ${finalText.substring(0, 200)}`);

    // Retry once: tell the AI it hallucinated and must use a tool
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "[SYSTEM] שגיאה: טענת שביצעת פעולה בלי להפעיל כלי. אנא נסי שוב — הפעם חובה להשתמש בכלי המתאים. אם אין כלי מתאים, אמרי בכנות שאין לך יכולת.",
    });

    const retryParams: any = {
      model: selectedModel,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages,
    };
    if (tools.length > 0) retryParams.tools = tools;

    try {
      let retryResponse = await withRetry(() => client.messages.create(retryParams));

      // Run tool loop on the retry too (AI might now actually call a tool)
      while (retryResponse.stop_reason === "tool_use") {
        const retryToolBlocks = retryResponse.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
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
          model: selectedModel,
          max_tokens: config.maxTokens,
          system: systemPrompt,
          messages,
        };
        if (tools.length > 0) retryLoopParams.tools = tools;

        retryResponse = await withRetry(() => client.messages.create(retryLoopParams));
      }

      textBlock = retryResponse.content.find((block) => block.type === "text");
      finalText = textBlock ? textBlock.text : finalText;
      console.log(`[hallucination-guard] Retry completed. New text: ${finalText.substring(0, 200)}`);
    } catch (retryErr) {
      console.error("[hallucination-guard] Retry failed:", retryErr);
      // Fall through with original finalText
    }

    // Still notify owner about the hallucination (even if retry fixed it)
    try {
      const { getNotifyOwnerCallback } = require("./callbacks");
      const notify = getNotifyOwnerCallback();
      if (notify) {
        const who = sender?.isOwner ? "בשיחה איתך" : `צ'אט: ${sender?.name || "unknown"}`;
        notify(`⚠️ [hallucination] לימור טענה שביצעה פעולה בלי tool! (retry triggered)\n${who}`).catch(() => {});
      }
    } catch {}
  }

  return finalText;
}
