/**
 * Handler for delegate_to_agent tool.
 * Routes tasks to sub-agents and returns their results.
 */
import type { ToolHandler } from "./types";
import { getAgent } from "../../agents/agent-registry";
import { runAgent } from "../../agents/agent-runner";

export const agentHandlers: Record<string, ToolHandler> = {
  delegate_to_agent: async (input) => {
    const { agent_id, task, context } = input;

    const agent = getAgent(agent_id);
    if (!agent) {
      return `❌ סוכנת "${agent_id}" לא קיימת. סוכנות זמינות: michal, ronit, noa, yael, tal`;
    }

    try {
      const result = await runAgent(agent, task, context);
      // Return with clear instruction to Limor: pass through as-is
      return `[תשובת ${agent.name} — העבירי כמו שזה ללא שינוי]\n\n${agent.emoji} *${agent.name}*:\n\n${result.text}`;
    } catch (error: any) {
      console.error(`[agent:${agent_id}] Error:`, error.message);
      return `❌ ${agent.name} נתקלה בשגיאה: ${error.message}`;
    }
  },
};
