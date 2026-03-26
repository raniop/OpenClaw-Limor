/**
 * Agent runner — executes a sub-agent with its own identity, model, and tools.
 * Supports tool loops (e.g., Ronit doing multiple web searches).
 */
import Anthropic from "@anthropic-ai/sdk";
import { client, withRetry } from "../ai/client";
import { handleToolCall } from "../ai/handle-tool-call";
import type { AgentConfig, AgentResult } from "./agent-types";

const AGENT_TIMEOUT_MS = 600_000; // 10 minutes for coding tasks
const MAX_AGENT_TOOL_ITERATIONS = 30;

/** Use streaming to avoid Anthropic 10-minute non-streaming timeout */
async function streamToMessage(params: any): Promise<Anthropic.Message> {
  const stream = await client.messages.stream(params);
  return stream.finalMessage();
}

import type { SenderContext } from "../ai/types";

// Owner sender context — agents run with owner permissions since they're delegated by Limor
const OWNER_SENDER: SenderContext = { chatId: "owner", name: "owner", isOwner: true };

export async function runAgent(
  agent: AgentConfig,
  task: string,
  context?: string,
): Promise<AgentResult> {
  const start = Date.now();
  console.log(`[agent:${agent.id}] ${agent.emoji} Running: ${task.substring(0, 80)}...`);

  const AGENT_ENFORCEMENT = `\n\n⛔ כללי ברזל:
1. אסור להמציא מידע! דווח רק על מה שקיבלת מהכלים.
2. אם הכלי החזיר "אין שגיאות" — אמור "אין שגיאות". אל תמציא שגיאות.
3. אם אין לך מידע — אמור "אין לי מידע על זה" ולא תמציא.
4. אל תוסיף פרטים שלא קיבלת מהכלים. מספרים, שמות, תאריכים — רק ממה שהכלי החזיר.
5. עדיף תשובה קצרה ונכונה מתשובה ארוכה ומומצאת.`;

  const userContent = context ? `משימה: ${task}\n\nהקשר:\n${context}` : `משימה: ${task}`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const apiParams: any = {
    model: agent.model,
    max_tokens: agent.maxTokens,
    system: [{ type: "text", text: agent.systemPrompt + AGENT_ENFORCEMENT, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (agent.tools && agent.tools.length > 0) {
    apiParams.tools = agent.tools;
  }

  // Race with timeout
  let response: Anthropic.Message;
  try {
    response = await Promise.race([
      withRetry(() => streamToMessage(apiParams)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AGENT_TIMEOUT")), AGENT_TIMEOUT_MS)
      ),
    ]);
  } catch (err: any) {
    if (err?.message === "AGENT_TIMEOUT") {
      console.error(`[agent:${agent.id}] ⏰ Timeout after ${AGENT_TIMEOUT_MS}ms`);
      return {
        agentId: agent.id,
        agentName: agent.name,
        text: `⏰ ${agent.name} לא הספיקה לסיים בזמן.`,
        tokensUsed: { input: 0, output: 0 },
        durationMs: Date.now() - start,
      };
    }
    throw err;
  }

  // Tool loop (for agents with tools, e.g., Ronit with web_search)
  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < MAX_AGENT_TOOL_ITERATIONS) {
    iterations++;
    const toolBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (toolBlocks.length === 0) break;

    const toolResults = await Promise.all(
      toolBlocks.map(async (tb) => {
        console.log(`[agent:${agent.id}] 🔧 Tool: ${tb.name}`);
        const result = await handleToolCall(tb.name, tb.input as Record<string, any>, OWNER_SENDER);
        return {
          type: "tool_result" as const,
          tool_use_id: tb.id,
          content: result,
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    const loopParams: any = {
      model: agent.model,
      max_tokens: agent.maxTokens,
      system: [{ type: "text", text: agent.systemPrompt + AGENT_ENFORCEMENT, cache_control: { type: "ephemeral" } }],
      messages,
    };
    if (agent.tools && agent.tools.length > 0) loopParams.tools = agent.tools;

    response = await withRetry(() => streamToMessage(loopParams));
  }

  // Extract text — if agent hit max iterations without writing text, summarize what was done
  const textBlock = response.content.find((b) => b.type === "text");
  let text = textBlock ? (textBlock as Anthropic.TextBlock).text : "";
  if (!text && iterations >= MAX_AGENT_TOOL_ITERATIONS) {
    text = `✅ ${agent.name} סיים ${iterations} פעולות (קריאה, עריכה, בנייה). המשימה בוצעה.`;
  } else if (!text) {
    text = `${agent.name} לא הצליח לייצר תשובה.`;
  }

  const durationMs = Date.now() - start;
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  console.log(`[agent:${agent.id}] ✅ Done in ${durationMs}ms (${inputTokens}+${outputTokens} tokens${iterations > 0 ? `, ${iterations} tool calls` : ""})`);

  return {
    agentId: agent.id,
    agentName: agent.name,
    text,
    tokensUsed: { input: inputTokens, output: outputTokens },
    durationMs,
  };
}
