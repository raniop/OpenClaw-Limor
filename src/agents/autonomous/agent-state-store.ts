/**
 * Agent State Store — SQLite-backed persistent state per agent.
 * Provides key-value state and run logging.
 */
import { getDb } from "../../stores/sqlite-init";
import type { AgentRun } from "../agent-types";

// --- Key-Value State ---

export function getAgentState(agentId: string, key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM agent_state WHERE agent_id = ? AND key = ?").get(agentId, key) as any;
  return row?.value ?? null;
}

export function setAgentState(agentId: string, key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO agent_state (agent_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) " +
    "ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run(agentId, key, value);
}

export function getAllAgentState(agentId: string): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM agent_state WHERE agent_id = ?").all(agentId) as any[];
  const state: Record<string, string> = {};
  for (const row of rows) {
    state[row.key] = row.value;
  }
  return state;
}

// --- Run Logging ---

export function logAgentRun(
  agentId: string,
  trigger: string,
  status: "success" | "error" | "timeout",
  resultSummary: string,
  tokensInput: number,
  tokensOutput: number,
  durationMs: number,
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO agent_runs (agent_id, trigger, status, result_summary, tokens_input, tokens_output, duration_ms) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(agentId, trigger, status, resultSummary.substring(0, 500), tokensInput, tokensOutput, durationMs);
}

export function getAgentRuns(agentId: string, limit: number = 10): AgentRun[] {
  const db = getDb();
  return db.prepare(
    "SELECT id, agent_id as agentId, trigger, status, result_summary as resultSummary, " +
    "tokens_input as tokensInput, tokens_output as tokensOutput, " +
    "duration_ms as durationMs, created_at as createdAt " +
    "FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(agentId, limit) as AgentRun[];
}

export function getLastRunTime(agentId: string): number | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT created_at FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(agentId) as any;
  return row ? new Date(row.created_at).getTime() : null;
}
