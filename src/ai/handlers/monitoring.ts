/**
 * Monitoring handlers — system health checks for נעמי.
 */
import type { ToolHandler } from "./types";
import { config } from "../../config";
import { listAgents } from "../../agents/agent-registry";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

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

  get_recent_changes: async (input) => {
    const days = input.days || 1;
    try {
      const projectDir = resolve(__dirname, "../../..");
      const since = `${days}.days.ago`;
      const log = execSync(
        `git log --since="${since}" --pretty=format:"%h | %ad | %s" --date=format:"%d/%m %H:%M" --no-merges`,
        { cwd: projectDir, encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (!log) return `אין שינויים ב-${days} ימים אחרונים`;
      const lines = log.split("\n");
      const diffStat = execSync(
        `git diff --stat HEAD~${Math.min(lines.length, 20)}..HEAD`,
        { cwd: projectDir, encoding: "utf-8", timeout: 5000 }
      ).trim();
      return `📝 שינויים ב-${days} ימים (${lines.length} commits):\n\n${log}\n\n📊 סיכום:\n${diffStat}`;
    } catch (err: any) {
      return `שגיאה: ${err.message}`;
    }
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

  // ─── DevOps tools ──────────────────────────────────────────────────

  run_command: async (input) => {
    const { command, timeout = 30000 } = input;
    const BLOCKED = /rm\s+-rf\s+\/|sudo|mkfs|dd\s+if|shutdown|reboot|kill\s+-9\s+1\b|>\s*\/dev/i;
    if (BLOCKED.test(command)) return "⛔ פקודה חסומה מסיבות בטיחות";
    try {
      const result = execSync(command, {
        cwd: resolve(__dirname, "../../.."),
        encoding: "utf-8",
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return result.trim() || "✅ הפקודה הושלמה (ללא פלט)";
    } catch (err: any) {
      return `❌ שגיאה:\n${err.stderr || err.message}`;
    }
  },

  pm2_manage: async (input) => {
    const { action, process: proc = "limor", lines = 30 } = input;
    const projectDir = resolve(__dirname, "../../..");
    try {
      switch (action) {
        case "restart":
          return execSync(`npx pm2 restart ${proc}`, { cwd: projectDir, encoding: "utf-8", timeout: 15000 }).trim();
        case "stop":
          return execSync(`npx pm2 stop ${proc}`, { cwd: projectDir, encoding: "utf-8", timeout: 15000 }).trim();
        case "status":
          return execSync(`npx pm2 status`, { cwd: projectDir, encoding: "utf-8", timeout: 10000 }).trim();
        case "logs":
          return execSync(`npx pm2 logs ${proc} --lines ${lines} --nostream`, { cwd: projectDir, encoding: "utf-8", timeout: 10000 }).trim();
        default:
          return "פעולה לא מוכרת. אפשרויות: restart, stop, status, logs";
      }
    } catch (err: any) {
      return `❌ PM2 שגיאה: ${err.stderr || err.message}`;
    }
  },

  tail_logs: async (input) => {
    const { lines = 50, filter } = input;
    const projectDir = resolve(__dirname, "../../..");
    try {
      const cmd = `npx pm2 logs limor --lines ${lines} --nostream`;
      let result = execSync(cmd, { cwd: projectDir, encoding: "utf-8", timeout: 10000 }).trim();
      if (filter) {
        const regex = new RegExp(filter, "i");
        result = result.split("\n").filter(l => regex.test(l)).join("\n");
      }
      return result || "אין לוגים תואמים";
    } catch (err: any) {
      return `❌ שגיאה: ${err.message}`;
    }
  },

  git_manage: async (input) => {
    const { action, args = "" } = input;
    const projectDir = resolve(__dirname, "../../..");
    try {
      switch (action) {
        case "pull":
          return execSync(`git pull`, { cwd: projectDir, encoding: "utf-8", timeout: 30000 }).trim();
        case "status":
          return execSync(`git status -s`, { cwd: projectDir, encoding: "utf-8", timeout: 5000 }).trim() || "✅ נקי — אין שינויים";
        case "stash":
          return execSync(`git stash ${args}`, { cwd: projectDir, encoding: "utf-8", timeout: 10000 }).trim();
        case "log":
          return execSync(`git log --oneline -20 ${args}`, { cwd: projectDir, encoding: "utf-8", timeout: 5000 }).trim();
        case "diff":
          return execSync(`git diff --stat ${args}`, { cwd: projectDir, encoding: "utf-8", timeout: 5000 }).trim() || "אין שינויים";
        default:
          return "פעולה לא מוכרת. אפשרויות: pull, status, stash, log, diff";
      }
    } catch (err: any) {
      return `❌ Git שגיאה: ${err.stderr || err.message}`;
    }
  },

  edit_file: async (input) => {
    const { path: filePath, search, replace } = input;
    const fullPath = resolve(__dirname, "../../..", filePath);
    try {
      if (!existsSync(fullPath)) return `❌ קובץ לא נמצא: ${filePath}`;
      let content = readFileSync(fullPath, "utf-8");
      if (!content.includes(search)) return `❌ הטקסט לא נמצא בקובץ`;
      content = content.replace(search, replace);
      writeFileSync(fullPath, content, "utf-8");
      return `✅ הקובץ עודכן: ${filePath}`;
    } catch (err: any) {
      return `❌ שגיאה: ${err.message}`;
    }
  },

  read_file_source: async (input) => {
    const { path: filePath, startLine, endLine } = input;
    const fullPath = resolve(__dirname, "../../..", filePath);
    try {
      if (!existsSync(fullPath)) return `❌ קובץ לא נמצא: ${filePath}`;
      const lines = readFileSync(fullPath, "utf-8").split("\n");
      const start = (startLine || 1) - 1;
      const end = endLine || lines.length;
      const slice = lines.slice(start, end);
      return slice.map((l, i) => `${start + i + 1}: ${l}`).join("\n");
    } catch (err: any) {
      return `❌ שגיאה: ${err.message}`;
    }
  },

  npm_manage: async (input) => {
    const { action, args = "" } = input;
    const projectDir = resolve(__dirname, "../../..");
    try {
      const cmd = `npm run ${action} ${args}`.trim();
      const result = execSync(cmd, { cwd: projectDir, encoding: "utf-8", timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
      const lines = result.trim().split("\n");
      return lines.length > 20 ? lines.slice(-20).join("\n") : result.trim();
    } catch (err: any) {
      const stderr = err.stderr || "";
      const stdout = err.stdout || "";
      return `❌ NPM שגיאה:\n${stderr}\n${stdout}`.trim().substring(0, 2000);
    }
  },

  restart_and_deploy: async () => {
    const projectDir = resolve(__dirname, "../../..");
    try {
      const buildResult = execSync("npm run build", { cwd: projectDir, encoding: "utf-8", timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
      const buildLines = buildResult.trim().split("\n");
      const buildSummary = buildLines.slice(-5).join("\n");

      if (buildResult.includes("error TS")) {
        return `❌ Build failed:\n${buildSummary}`;
      }

      // Schedule restart AFTER response is sent (20 second delay)
      // Agent needs to finish tool loop → Limor processes → sends WhatsApp → then restart
      setTimeout(() => {
        try {
          execSync("npx pm2 restart limor", { cwd: projectDir, encoding: "utf-8", timeout: 15000 });
        } catch {}
      }, 20000);

      return `✅ בנייה הושלמה בהצלחה! 🔄 ${config.botName} תעשה restart עצמי בעוד 3 שניות.\n\nBuild:\n${buildSummary}`;
    } catch (err: any) {
      return `❌ שגיאה:\n${err.stderr || err.message}`;
    }
  },
};
