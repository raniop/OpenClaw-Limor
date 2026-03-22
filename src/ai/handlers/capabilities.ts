import { createSpec, listPending, listApproved, approveSpec } from "../../capabilities";
import { createWorktree, runInWorktree, readProjectFile, writeProjectFile, buildAndTest, getDiff, applyWorktree, cleanupWorktree } from "../../capabilities/sandbox";
import { runCapabilityImplementation } from "../../capabilities/capability-runner";
import { implementCapability } from "../../capabilities/claude-code";
import { logAudit } from "../../audit/audit-log";
import { getNotifyOwnerCallback } from "../callbacks";
import type { ToolHandler } from "./types";

export const capabilitiesHandlers: Record<string, ToolHandler> = {
  create_capability_request: async (input, sender) => {
    const actor = sender?.name || "unknown";
    const spec = createSpec({
      title: input.title,
      requestedBy: sender!.name,
      problem: input.problem,
      whyCurrentSystemCantDoIt: input.why_cant_do_it,
      proposedSolution: input.proposed_solution,
      affectedModules: input.affected_modules ? input.affected_modules.split(",").map((s: string) => s.trim()) : [],
      requiredTools: [],
      risks: input.risks ? input.risks.split(",").map((s: string) => s.trim()) : [],
      validationPlan: input.validation_plan || "",
      level: input.level || "code_change",
    });
    console.log(`[capability] New capability request: ${spec.id} — ${spec.title}`);
    logAudit(actor, "capability_created", spec.id, "success");

    // Owner requests → auto-approve, auto-implement, and auto-apply
    if (sender?.isOwner) {
      console.log(`[capability] Owner request — auto-approving and implementing: ${spec.id}`);
      approveSpec(spec.id);
      spec.autoApply = true;
      logAudit(actor, "capability_auto_approved", spec.id, "success");

      // Run implementation in background
      runCapabilityImplementation(spec.id).then((result: string) => {
        console.log(`[capability] Auto-implementation result: ${result.substring(0, 200)}`);
        const notify = getNotifyOwnerCallback();
        if (notify) notify(result);
      }).catch((err: any) => {
        console.error(`[capability] Auto-implementation failed:`, err);
        const notify = getNotifyOwnerCallback();
        if (notify) notify(`❌ המימוש נכשל: ${err.message}`);
      });

      return `🚀 מתחילה לממש: **${spec.title}**\n\nהקוד נכתב, נבנה ומוחל אוטומטית. אעדכן כשזה מוכן!`;
    }

    return `✅ בקשת יכולת נוצרה!\n\n📋 **${spec.title}** (${spec.id})\nסטטוס: ממתין לאישור\nרמה: ${spec.level}\n\nהבעיה: ${spec.problem}\nפתרון מוצע: ${spec.proposedSolution}\n\nכדי לאשר: *אשר יכולת ${spec.id}*`;
  },

  list_capability_requests: async (input) => {
    const status = input.status || "pending";
    const specs = status === "approved" ? listApproved() :
      status === "all" ? [...listPending(), ...listApproved()] : listPending();
    if (specs.length === 0) return `אין בקשות יכולת ${status === "pending" ? "ממתינות" : ""}.`;
    return specs.map(s => `- **${s.title}** (${s.id}) [${s.status}] — ${s.level}`).join("\n");
  },

  run_capability: async (input) => {
    console.log(`[capability] Running full implementation for: ${input.capability_id}`);
    return runCapabilityImplementation(input.capability_id);
  },

  code_start_session: async (input) => {
    return createWorktree(input.capability_id);
  },

  code_read: async (input) => {
    return readProjectFile(input.path, input.capability_id);
  },

  code_write: async (input) => {
    return writeProjectFile(input.capability_id, input.path, input.content);
  },

  code_execute: async (input) => {
    return runInWorktree(input.capability_id, input.command);
  },

  code_build_test: async (input) => {
    return buildAndTest(input.capability_id);
  },

  code_show_diff: async (input) => {
    return getDiff(input.capability_id);
  },

  code_apply: async (input) => {
    return applyWorktree(input.capability_id);
  },

  code_cleanup: async (input) => {
    return cleanupWorktree(input.capability_id);
  },

  code_implement: async (input) => {
    console.log(`[claude-code] Implementation requested for: ${input.capability_id}`);
    return implementCapability(input.capability_id);
  },
};
