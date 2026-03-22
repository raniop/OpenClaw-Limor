/**
 * Monitoring handlers — system health checks for נעמי.
 */
import type { ToolHandler } from "./types";
import { listAgents } from "../../agents/agent-registry";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(__dirname, "../../../workspace/state");

export const monitoringHandlers: Record<string, ToolHandler> = {
  // Full system report — combines health + errors + agent stats in one call
  full_system_report: async () => {
    const sub = monitoringHandlers;
    const [health, errors, stats] = await Promise.all([
      sub.system_health_check({}),
      sub.get_error_logs({ hours: 24 }),
      sub.get_agent_stats({}),
    ]);
    return `=== בריאות מערכת ===\n${health}\n\n=== שגיאות ב-24 שעות ===\n${errors}\n\n=== סוכנים ===\n${stats}`;
  },

  system_health_check: async () => {
    const checks: string[] = [];

    // 1. SQLite check
    const dbPath = resolve(STATE_DIR, "limor.db");
    checks.push(existsSync(dbPath) ? "✅ SQLite: תקין" : "🚨 SQLite: לא נמצא!");

    // 2. Agent count
    const agents = listAgents();
    checks.push(`✅ סוכנות רשומות: ${agents.length}`);
    agents.forEach(a => checks.push(`  ${a.emoji} ${a.name} — ${a.tools?.length || 0} כלים`));

    // 3. Operational traces
    try {
      const tracesPath = resolve(STATE_DIR, "operational-traces.json");
      if (existsSync(tracesPath)) {
        const data = JSON.parse(readFileSync(tracesPath, "utf-8"));
        const traces = data.traces || data;
        const recent = Array.isArray(traces) ? traces.filter((t: any) => {
          const age = Date.now() - new Date(t.timestamp).getTime();
          return age < 24 * 60 * 60 * 1000;
        }) : [];
        const errors = recent.filter((t: any) => t.selfCheck?.alertLevel === "critical");
        checks.push(`📊 Traces ב-24 שעות: ${recent.length} (${errors.length} קריטיים)`);
        if (recent.length > 0) {
          const avgDuration = Math.round(recent.reduce((s: number, t: any) => s + (t.totalDurationMs || 0), 0) / recent.length);
          checks.push(`⏱️ זמן תגובה ממוצע: ${avgDuration}ms`);
        }
      }
    } catch {}

    // 4. Followups
    try {
      const fuPath = resolve(STATE_DIR, "followups.json");
      if (existsSync(fuPath)) {
        const followups = JSON.parse(readFileSync(fuPath, "utf-8"));
        const pending = followups.filter((f: any) => f.status === "pending");
        checks.push(`📋 מעקבים פתוחים: ${pending.length}`);
      }
    } catch {}

    // 5. Contacts
    try {
      const contactsPath = resolve(STATE_DIR, "contacts.json");
      if (existsSync(contactsPath)) {
        const contacts = JSON.parse(readFileSync(contactsPath, "utf-8"));
        checks.push(`👥 אנשי קשר: ${Object.keys(contacts).length}`);
      }
    } catch {}

    // 6. Deliveries
    try {
      const delPath = resolve(STATE_DIR, "deliveries.json");
      if (existsSync(delPath)) {
        const deliveries = JSON.parse(readFileSync(delPath, "utf-8"));
        const pending = deliveries.filter((d: any) => d.status === "pending");
        checks.push(`📦 משלוחים ממתינים: ${pending.length}`);
      }
    } catch {}

    // 7. Uptime
    checks.push(`⏰ Uptime: ${Math.round(process.uptime() / 60)} דקות`);
    checks.push(`💾 זיכרון: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    return checks.join("\n");
  },

  get_error_logs: async (input) => {
    const hours = input.hours || 24;
    try {
      const tracesPath = resolve(STATE_DIR, "operational-traces.json");
      if (!existsSync(tracesPath)) return "אין לוגים";
      const data = JSON.parse(readFileSync(tracesPath, "utf-8"));
      const traces = data.traces || data;
      if (!Array.isArray(traces)) return "אין traces";

      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const recent = traces.filter((t: any) => new Date(t.timestamp).getTime() > cutoff);
      const withFlags = recent.filter((t: any) => t.selfCheck?.flags?.length > 0);

      if (withFlags.length === 0) return `✅ אין שגיאות ב-${hours} שעות אחרונות`;

      const lines = withFlags.map((t: any) =>
        `⚠️ ${t.contactName} | ${t.selfCheck.flags.join(", ")} | ${new Date(t.timestamp).toLocaleTimeString("he-IL")}`
      );
      return `שגיאות ב-${hours} שעות:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `שגיאה בקריאת לוגים: ${err.message}`;
    }
  },

  get_agent_stats: async () => {
    // For now, return registered agents info
    // In the future, we can track actual usage in SQLite
    const agents = listAgents();
    const lines = agents.map(a =>
      `${a.emoji} ${a.name} | מודל: ${a.model.split("-")[1]} | כלים: ${a.tools?.map(t => t.name).join(", ") || "—"}`
    );
    return `📊 סטטיסטיקות סוכנות (${agents.length} רשומות):\n\n${lines.join("\n")}`;
  },
};
