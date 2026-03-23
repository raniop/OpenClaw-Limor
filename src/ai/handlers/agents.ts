/**
 * Handler for delegate_to_agent tool.
 * Routes tasks to sub-agents and returns their results.
 * Sends an interim "working on it" message to the user before running the agent.
 */
import type { ToolHandler } from "./types";
import { getAgent } from "../../agents/agent-registry";
import { runAgent } from "../../agents/agent-runner";
import { getSendMessageCallback } from "../callbacks";

const INTERIM_MESSAGES: Record<string, string> = {
  michal: "בודקת עם מיכל 👁️ מה היה בקבוצה...",
  ronit: "מעבירה לרונית 🔍 לחקור...",
  noa: "נועה 📊 מנתחת את הנתונים...",
  yael: "יעל ⚡ מגדירה את זה...",
  tal: "טל 🛡️ בודקת...",
  maya: "מאיה 🏠 מטפלת בזה...",
  adi: "עדי 📅 בודקת את היומן...",
  hila: "הילה 🍽️ מחפשת לך משהו טוב...",
  dana: "דנה 🛒 משווה מחירים...",
  boris: "בוריס 🔧 בודק את המערכת...",
  yuri: "יורי 💻 עובד על זה...",
};

export const agentHandlers: Record<string, ToolHandler> = {
  delegate_to_agent: async (input, sender) => {
    const { agent_id, task, context } = input;

    const agent = getAgent(agent_id);
    if (!agent) {
      return `❌ סוכנת "${agent_id}" לא קיימת.`;
    }

    // Send interim message to user so they know we're working on it
    try {
      const sendMsg = getSendMessageCallback();
      if (sendMsg && sender?.chatId) {
        const interim = INTERIM_MESSAGES[agent_id] || `${agent.emoji} ${agent.name} עובד/ת על זה...`;
        await sendMsg(sender.chatId, interim);
      }
    } catch {}

    try {
      const result = await runAgent(agent, task, context);
      return `[תשובת ${agent.name} — העבירי כמו שזה ללא שינוי]\n\n${agent.emoji} *${agent.name}*:\n\n${result.text}`;
    } catch (error: any) {
      console.error(`[agent:${agent_id}] Error:`, error.message);
      return `❌ ${agent.name} נתקלה בשגיאה: ${error.message}`;
    }
  },
};
