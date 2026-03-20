/**
 * Capability implementation orchestrator.
 * Runs the full lifecycle: start session → implement → build/test → diff → apply → cleanup.
 */
import { getSpec } from "./spec-store";
import { createWorktree, buildAndTest, getDiff, applyWorktree, cleanupWorktree } from "./sandbox";
import { implementCapability } from "./claude-code";
import { logAudit } from "../audit/audit-log";
import { getNotifyOwnerCallback } from "../ai/callbacks";

export async function runCapabilityImplementation(capabilityId: string): Promise<string> {
  const spec = getSpec(capabilityId);
  if (!spec) {
    return `❌ לא מצאתי יכולת עם מזהה ${capabilityId}`;
  }
  if (spec.status !== "approved") {
    return `❌ היכולת "${spec.title}" לא אושרה עדיין. סטטוס: ${spec.status}`;
  }

  const steps: string[] = [];
  let currentStep = "";

  try {
    // Step 1: Start session (create worktree)
    currentStep = "start_session";
    const worktreeResult = await createWorktree(capabilityId);
    steps.push(`✅ סשן נוצר: ${worktreeResult}`);
    logAudit("system", "capability_start_session", capabilityId, "success");

    // Step 2: Implement with Claude Code (with progress updates to owner)
    currentStep = "implement";
    const notify = getNotifyOwnerCallback();
    const onProgress = notify
      ? (msg: string) => { notify(msg).catch(() => {}); }
      : undefined;
    const implResult = await implementCapability(capabilityId, onProgress);
    steps.push(`✅ מימוש: ${implResult.substring(0, 200)}...`);
    logAudit("system", "capability_implement", capabilityId, "success");

    // Step 3: Build and test
    currentStep = "build_test";
    const buildResult = await buildAndTest(capabilityId);
    const buildOk = !buildResult.toLowerCase().includes("error");
    steps.push(buildOk ? `✅ בנייה ובדיקות עברו` : `⚠️ בנייה: ${buildResult.substring(0, 200)}`);
    logAudit("system", "capability_build_test", capabilityId, buildOk ? "success" : "warning");

    if (!buildOk) {
      steps.push(`\n⚠️ הבנייה נכשלה. הקוד נשאר ב-worktree לבדיקה ידנית.`);
      return steps.join("\n");
    }

    // Step 4: Show diff
    currentStep = "show_diff";
    const diff = await getDiff(capabilityId);
    const diffLines = diff.split("\n").length;
    steps.push(`📝 שינויים: ${diffLines} שורות`);

    // Step 5: Apply
    currentStep = "apply";
    const applyResult = await applyWorktree(capabilityId);
    steps.push(`✅ שינויים הוחלו: ${applyResult}`);
    logAudit("system", "capability_apply", capabilityId, "success");

    // Step 6: Cleanup
    currentStep = "cleanup";
    const cleanResult = await cleanupWorktree(capabilityId);
    steps.push(`🧹 נוקה: ${cleanResult}`);
    logAudit("system", "capability_cleanup", capabilityId, "success");

    return `🎉 יכולת "${spec.title}" מומשה בהצלחה!\n\n${steps.join("\n")}`;
  } catch (error: any) {
    logAudit("system", `capability_${currentStep}`, capabilityId, `error: ${error.message}`);
    steps.push(`\n❌ נכשל בשלב ${currentStep}: ${error.message}`);
    return steps.join("\n");
  }
}
