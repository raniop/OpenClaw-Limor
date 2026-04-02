/**
 * Agent system types.
 * Each agent has an identity, model, and optional tools.
 */
import type Anthropic from "@anthropic-ai/sdk";

export interface AgentTrigger {
  event: string;
  filter?: Record<string, any>;
}

export interface AutonomousConfig {
  /** Cron expression (Israel timezone). null = no scheduled runs. */
  schedule?: string;
  /** Events this agent subscribes to */
  triggers?: AgentTrigger[];
  /** Whether to notify owner with the result */
  notifyOwner?: boolean;
  /** Rate limit: minimum ms between autonomous runs */
  minIntervalMs?: number;
  /** Whether this agent is enabled for autonomous mode */
  enabled?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  tools?: Anthropic.Tool[];
  /** Description shown to Limor so she knows when to delegate */
  delegationHint: string;
  /** Autonomous mode configuration (optional) */
  autonomousConfig?: AutonomousConfig;
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  text: string;
  tokensUsed: { input: number; output: number };
  durationMs: number;
}

export interface AgentRun {
  id: number;
  agentId: string;
  trigger: string;
  status: "success" | "error" | "timeout";
  resultSummary: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  createdAt: string;
}

export type AgentId = "michal" | "ronit" | "noa" | "yael" | "tal" | "maya" | "adi" | "hila" | "dana" | "boris" | "yuri" | "nimrod" | "amit";
