/**
 * Agent system types.
 * Each agent has an identity, model, and optional tools.
 */
import type Anthropic from "@anthropic-ai/sdk";

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
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  text: string;
  tokensUsed: { input: number; output: number };
  durationMs: number;
}

export type AgentId = "michal" | "ronit" | "noa" | "yael" | "tal" | "maya" | "adi" | "hila" | "dana" | "boris" | "yuri" | "nimrod" | "amit";
