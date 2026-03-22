/**
 * Agent registry — loads and manages all sub-agents.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AgentConfig, AgentId } from "./agent-types";
import { webSearchTools } from "../ai/tools/web-search";
import { contactTools } from "../ai/tools/contacts";
import { calendarTools } from "../ai/tools/calendar";
import { smsTools } from "../ai/tools/sms";
import { instructionTools } from "../ai/tools/instructions";
import { bookingTools } from "../ai/tools/booking";
import { smartHomeTools } from "../ai/tools/smarthome";
import { monitoringTools } from "../ai/tools/monitoring";

const SOULS_DIR = resolve(__dirname, "../../souls");

function loadSoul(filename: string): any {
  const path = resolve(SOULS_DIR, filename);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function buildAgent(filename: string, tools?: any[]): AgentConfig {
  const soul = loadSoul(filename);
  return {
    id: filename.replace(".json", ""),
    name: soul.name,
    emoji: soul.emoji,
    model: soul.model.name,
    systemPrompt: soul.systemPrompt,
    maxTokens: soul.model.maxTokens,
    tools,
    delegationHint: soul.role,
  };
}

// Helper: pick specific tools by name from a tool array
function pickTools(sources: any[], names: string[]): any[] {
  const nameSet = new Set(names);
  return sources.filter((t: any) => nameSet.has(t.name));
}

// Build all agents with their specific tools
const agents: Map<string, AgentConfig> = new Map();

// מיכל — group summarizer
agents.set("michal", buildAgent("michal.json",
  pickTools(contactTools, ["get_group_history", "summarize_group_activity"])
));

// רונית — internet researcher
agents.set("ronit", buildAgent("ronit.json", webSearchTools));

// נועה — data analyst
agents.set("noa", buildAgent("noa.json",
  pickTools([...calendarTools, ...smsTools, ...contactTools], ["list_events", "read_sms", "list_contacts"])
));

// יעל — automation
agents.set("yael", buildAgent("yael.json",
  pickTools([...contactTools, ...instructionTools], ["create_reminder", "learn_instruction"])
));

// טל — security
agents.set("tal", buildAgent("tal.json", webSearchTools));

// מאיה — smart home
agents.set("maya", buildAgent("maya.json", smartHomeTools));

// עדי — calendar management
agents.set("adi", buildAgent("adi.json",
  pickTools(calendarTools, ["list_events", "create_event", "delete_event"])
));

// הילה — restaurants & booking
agents.set("hila", buildAgent("hila.json",
  [...bookingTools, ...webSearchTools]
));

// דנה — shopping & price comparison
agents.set("dana", buildAgent("dana.json", webSearchTools));

// בוריס — system monitoring & DevOps
agents.set("boris", buildAgent("boris.json", monitoringTools));

export function getAgent(id: string): AgentConfig | undefined {
  return agents.get(id);
}

export function listAgents(): AgentConfig[] {
  return Array.from(agents.values());
}

export function getAgentIds(): AgentId[] {
  return Array.from(agents.keys()) as AgentId[];
}
