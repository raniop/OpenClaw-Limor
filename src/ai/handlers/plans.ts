import { createPlan, updateStep, getActivePlans, formatPlanStatus, cancelPlan } from "../../stores/plan-store";
import { config } from "../../config";
import type { ToolHandler } from "./types";

export const planHandlers: Record<string, ToolHandler> = {
  create_plan: async (input, sender) => {
    const chatId = sender?.chatId || config.ownerChatId;
    if (!input.steps || input.steps.length === 0) {
      return "❌ צריך לפחות שלב אחד בתוכנית";
    }

    const plan = createPlan(chatId, input.title, input.steps);
    return formatPlanStatus(plan);
  },

  update_plan_step: async (input) => {
    const plan = updateStep(input.plan_id, input.step_id, input.status, input.notes);
    if (!plan) return `❌ לא מצאתי תוכנית ${input.plan_id} או שלב ${input.step_id}`;

    const statusText = plan.status === "completed" ? "\n\n🎉 כל השלבים הושלמו — התוכנית סומנה כמושלמת!" : "";
    return formatPlanStatus(plan) + statusText;
  },

  list_plans: async (_input, sender) => {
    const chatId = sender?.chatId || config.ownerChatId;
    const plans = getActivePlans(chatId);
    if (plans.length === 0) return "אין תוכניות פעילות כרגע.";
    return plans.map(formatPlanStatus).join("\n\n");
  },
};
