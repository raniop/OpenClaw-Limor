/**
 * Plan store — persistent multi-step plans in SQLite.
 * Used for complex tasks that span multiple conversations.
 */
import { getDb } from "./sqlite-init";

export interface PlanStep {
  id: number;
  description: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  notes?: string;
}

export interface Plan {
  id: string;
  chatId: string;
  title: string;
  status: "active" | "completed" | "cancelled";
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `plan-${ts}-${rand}`;
}

function rowToPlan(row: any): Plan {
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title,
    status: row.status,
    steps: JSON.parse(row.steps),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPlan(chatId: string, title: string, stepDescriptions: string[]): Plan {
  const db = getDb();
  const id = generateId();
  const steps: PlanStep[] = stepDescriptions.map((desc, i) => ({
    id: i + 1,
    description: desc,
    status: "pending",
  }));

  db.prepare(
    "INSERT INTO plans (id, chat_id, title, status, steps) VALUES (?, ?, ?, 'active', ?)"
  ).run(id, chatId, title, JSON.stringify(steps));

  return {
    id,
    chatId,
    title,
    status: "active",
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getPlan(id: string): Plan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as any;
  return row ? rowToPlan(row) : null;
}

export function getActivePlans(chatId: string): Plan[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM plans WHERE chat_id = ? AND status = 'active' ORDER BY created_at DESC"
  ).all(chatId) as any[];
  return rows.map(rowToPlan);
}

export function updateStep(
  planId: string,
  stepId: number,
  status: PlanStep["status"],
  notes?: string
): Plan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as any;
  if (!row) return null;

  const steps: PlanStep[] = JSON.parse(row.steps);
  const step = steps.find((s) => s.id === stepId);
  if (!step) return null;

  step.status = status;
  if (notes) step.notes = notes;

  db.prepare(
    "UPDATE plans SET steps = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(steps), planId);

  // Auto-complete plan if all steps are done/skipped
  const allDone = steps.every((s) => s.status === "done" || s.status === "skipped");
  if (allDone) {
    db.prepare("UPDATE plans SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(planId);
  }

  return getPlan(planId);
}

export function completePlan(planId: string): Plan | null {
  const db = getDb();
  db.prepare(
    "UPDATE plans SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
  ).run(planId);
  return getPlan(planId);
}

export function cancelPlan(planId: string): Plan | null {
  const db = getDb();
  db.prepare(
    "UPDATE plans SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).run(planId);
  return getPlan(planId);
}

export function formatPlanStatus(plan: Plan): string {
  const done = plan.steps.filter((s) => s.status === "done").length;
  const total = plan.steps.length;
  const lines = [`📋 **${plan.title}** (${done}/${total})`];

  for (const step of plan.steps) {
    const icon =
      step.status === "done" ? "✅" :
      step.status === "in_progress" ? "🔄" :
      step.status === "skipped" ? "⏭️" : "⬜";
    const notes = step.notes ? ` — ${step.notes}` : "";
    lines.push(`${icon} ${step.id}. ${step.description}${notes}`);
  }

  return lines.join("\n");
}
