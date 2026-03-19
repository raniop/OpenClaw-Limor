/**
 * Decision store — records recent system decisions for explainability.
 * Ring-buffer style, persisted to JSON.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type { DecisionRecord, DecisionCategory } from "./explain-types";
const MAX_ENTRIES = 200;

function ensureDir(): void {
  const dir = dirname(statePath("decisions.json"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): DecisionRecord[] {
  ensureDir();
  const p = statePath("decisions.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: DecisionRecord[]): void {
  ensureDir();
  writeFileSync(statePath("decisions.json"), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `dec-${ts}-${rand}`;
}

export function recordDecision(params: {
  actor: string;
  category: DecisionCategory;
  summary: string;
  inputContext?: string[];
  rulesApplied?: string[];
  toolsUsed?: string[];
  outcome: string;
  confidence?: number;
  target?: string;
}): DecisionRecord {
  const entries = readStore();
  const record: DecisionRecord = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor: params.actor,
    category: params.category,
    summary: params.summary,
    inputContext: params.inputContext || [],
    rulesApplied: params.rulesApplied || [],
    toolsUsed: params.toolsUsed || [],
    outcome: params.outcome,
    confidence: params.confidence,
    target: params.target,
  };
  entries.push(record);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  writeStore(entries);
  return record;
}

export function getRecentDecisions(limit: number = 20): DecisionRecord[] {
  return readStore().slice(-limit);
}

export function getDecisionsByCategory(category: DecisionCategory, limit: number = 20): DecisionRecord[] {
  return readStore()
    .filter((d) => d.category === category)
    .slice(-limit);
}

export function getDecisionsByTarget(target: string, limit: number = 10): DecisionRecord[] {
  return readStore()
    .filter((d) => d.target === target)
    .slice(-limit);
}

export function getDecisionById(id: string): DecisionRecord | null {
  return readStore().find((d) => d.id === id) || null;
}
