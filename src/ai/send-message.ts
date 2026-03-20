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
  crmTools, instructionTools, fileTools, contactTools, smartHomeTools, capabilityTools, modelTools, codingTools, gettTools, whatsappExtraTools, smsTools,
} from "./tools";
import { handleToolCall } from "./handle-tool-call";
import { log } from "../logger";
import { startTimer } from "../observability";

export interface SendMessageOptions {
  /** When false, tools are stripped from the API call to prevent execution. Default: true. */
  allowTools?: boolean;
  /** When provided and non-empty, filter tools to only these names. Empty array = no tools. */
  allowedToolNames?: string[];
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

  // Check if Rani ACTUALLY approved a meeting via the meeting store (not AI hallucination)
  const { meetingStore } = require("../stores");
  const chatId = sender?.chatId || "";
  const raniApproved = !sender?.isOwner && meetingStore.isApproved(chatId);

  // Extract approved time from meeting store (not from AI messages)
  let mentionedTime = "";
  if (raniApproved) {
    const approvedMeeting = meetingStore.getApprovedMeeting(chatId);
    if (approvedMeeting?.approvedTime) {
      mentionedTime = approvedMeeting.approvedTime;
    }
  }

  // Anti-hallucination rules for calendar — CRITICAL
  systemPrompt += `\n\n🚨 כללים חמורים ביותר — הפרה = כשל קריטי:

1. אם מישהו מבקש פגישה עם רני — חובה להפעיל את הכלי request_meeting בפועל! אסור רק לכתוב "שולחת בקשה" בלי להפעיל את הכלי!
2. אסור בשום מצב לטעון שיש פגישה ביומן בלי להפעיל קודם את list_events!
3. אסור להמציא זמנים או אירועים!
4. אסור לשלוח send_calendar_invite בלי שרני אישר באמת!
5. אם יש לך כלי זמין — חובה להשתמש בו! אסור לשקר שעשית פעולה בלי להפעיל את הכלי!
6. אם אתה אומר למשתמש "שולחת בקשה לרני" — חייב להפעיל request_meeting באותו תור! אחרת זה שקר!`;

  // Add sender context so bot knows who's talking
  if (sender) {
    if (sender.isOwner) {
      systemPrompt += `\n\nהמשתמש הנוכחי: רני (הבעלים שלך). אפשר לקבוע לו אירועים ישירות ביומן. יש לך גם גישה ל-CRM של ביטוח אופיר.`;
      if (config.ownerName && config.ownerPhone) {
        systemPrompt += `\n\n📋 פרטי רני להזמנת מסעדות (השתמשי בהם אוטומטית בלי לשאול!): שם: ${config.ownerName}, טלפון: ${config.ownerPhone}, מייל: ${config.ownerEmail || ""}`;
      }
    } else {
      if (raniApproved) {
        const timeInfo = mentionedTime ? ` השעה שאושרה: ${mentionedTime}.` : "";
        systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). ⚠️ רני אישר את הפגישה דרך המערכת!${timeInfo} בקשי מ-${sender.name} את כתובת המייל שלו ושלחי זימון עם send_calendar_invite. נושא: "שיחה עם רני".`;
      } else {
        systemPrompt += `\n\nהמשתמש הנוכחי: ${sender.name} (לא הבעלים). אם הוא רוצה לקבוע פגישה עם רני – חובה להשתמש ב-request_meeting! אסור לקבוע ישירות או לשלוח זימון בלי אישור רני!`;
      }
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
      ? [...calendarTools, ...travelTools, ...bookingTools, ...crmTools, ...instructionTools, ...fileTools, ...contactTools, ...smartHomeTools, ...capabilityTools, ...modelTools, ...codingTools, ...gettTools, ...whatsappExtraTools, ...smsTools]
      : [...calendarTools, ...travelTools, ...bookingTools];

  // Apply tool routing filter — narrow to only allowed tool names
  if (toolsEnabled && options?.allowedToolNames && options.allowedToolNames.length > 0) {
    const allowed = new Set(options.allowedToolNames);
    tools = tools.filter((t) => allowed.has(t.name));
  }

  // Debug: log tool count and names
  console.log(`[send-message] Tools: ${tools.length} | allowTools=${options?.allowTools} | allowedNames=${options?.allowedToolNames?.length ?? 'none'} | names=${tools.map(t=>t.name).join(',')}`);

  const apiParams: any = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
  };
  if (tools.length > 0) apiParams.tools = tools;

  let response = await withRetry(() => client.messages.create(apiParams));

  // Handle tool use loop (supports multiple parallel tool calls)
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
        return { id: toolBlock.id, result };
      })
    );

    // Send all tool results back
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.id,
        content: tr.result,
      })),
    });

    const loopParams: any = {
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages,
    };
    if (tools.length > 0) loopParams.tools = tools;

    response = await withRetry(() => client.messages.create(loopParams));
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const finalText = textBlock ? textBlock.text : "אופס, לא הצלחתי לייצר תשובה 😅 נסה שוב?";

  // Hallucination guard: if AI claims it did something but no tool was called
  const hadToolCalls = response.content.some((b) => b.type === "tool_use") ||
    messages.some((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));

  if (!hadToolCalls && tools.length > 0) {
    const claimsAction = /שולחת בקשה|שלחתי בקשה|שולחת לרני|העברתי לרני|קבעתי|שלחתי זימון|שולחת זימון|שלחתי הודעה|שלחתי ל|העברתי ל|בדקתי את|מצאתי (מסעדה|טיסה|מלון)|הזמנתי|ביטלתי|יצרתי|נוצרה|הוספתי|מחקתי/.test(finalText);
    if (claimsAction) {
      console.warn(`[hallucination-guard] ⚠️ AI claimed action but no tool was called! Text: ${finalText.substring(0, 100)}`);
    }
  }

  return finalText;
}
