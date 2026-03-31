/**
 * Capability implementation orchestrator.
 * Routes capability specs to Yuri (developer agent) for implementation.
 * Yuri handles: read files → plan → edit → build → deploy.
 */
import { getSpec, saveSpec } from "./spec-store";
import { getAgent } from "../agents/agent-registry";
import { runAgent } from "../agents/agent-runner";
import { logAudit } from "../audit/audit-log";
import { getNotifyOwnerCallback } from "../ai/callbacks";
import type { CapabilitySpec } from "./types";

function buildYuriTask(spec: CapabilitySpec): string {
  const modules = spec.affectedModules.length > 0
    ? `\n\n**מודולים שכנראה צריך לשנות:** ${spec.affectedModules.join(", ")}`
    : "";
  const risks = spec.risks.length > 0
    ? `\n\n**סיכונים לשים לב:** ${spec.risks.join(", ")}`
    : "";
  const validation = spec.validationPlan
    ? `\n\n**תוכנית בדיקה:** ${spec.validationPlan}`
    : "";

  return `📋 **בקשת יכולת: ${spec.title}** (${spec.id})

**הבעיה:** ${spec.problem}

**למה המערכת לא יכולה עכשיו:** ${spec.whyCurrentSystemCantDoIt}

**הפתרון המוצע:** ${spec.proposedSolution}${modules}${risks}${validation}

**הוראות:**
1. קרא את הקבצים הרלוונטיים והבן את הארכיטקטורה
2. ממש את הפתרון המוצע
3. בנה (npm run build) וודא שאין שגיאות
4. פרוס (restart_and_deploy)
5. דווח סיכום: מה שונה, אילו קבצים נוגעו, ואיך לבדוק`;
}

export async function runCapabilityImplementation(capabilityId: string): Promise<string> {
  const spec = getSpec(capabilityId);
  if (!spec) {
    return `❌ לא מצאתי יכולת עם מזהה ${capabilityId}`;
  }
  if (spec.status !== "approved") {
    return `❌ היכולת "${spec.title}" לא אושרה עדיין. סטטוס: ${spec.status}`;
  }

  const yuri = getAgent("yuri");
  if (!yuri) {
    return `❌ הסוכן יורי לא נמצא ברישום`;
  }

  const notify = getNotifyOwnerCallback();

  try {
    logAudit("system", "capability_start", capabilityId, "success");

    if (notify) {
      await notify(`🧩 מתחילה לממש: **${spec.title}**\nמעבירה ליורי 💻...`);
    }

    const task = buildYuriTask(spec);
    const result = await runAgent(yuri, task);

    logAudit("system", "capability_implemented", capabilityId, "success");

    const summary = `🎉 יכולת "${spec.title}" מומשה!\n\n${result.text}\n\n⏱️ ${Math.round(result.durationMs / 1000)}s | 🔤 ${result.tokensUsed.input + result.tokensUsed.output} tokens`;

    if (notify) {
      await notify(summary);
    }

    return summary;
  } catch (error: any) {
    logAudit("system", "capability_failed", capabilityId, `error: ${error.message}`);
    const errorMsg = `❌ מימוש יכולת "${spec.title}" נכשל: ${error.message}`;

    if (notify) {
      await notify(errorMsg);
    }

    return errorMsg;
  }
}
