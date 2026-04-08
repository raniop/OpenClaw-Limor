import {
  addRule,
  removeRule,
  computeExpiry,
  formatRulesList,
} from "../../operational-rules";
import type { RuleSubsystem, RuleAction } from "../../operational-rules";
import type { ToolHandler } from "./types";

export const operationalRulesHandlers: Record<string, ToolHandler> = {
  save_operational_rule: async (input) => {
    const subsystem = input.subsystem as RuleSubsystem;
    const action = input.action as RuleAction;
    const conditions = input.conditions || {};
    const description = input.description as string;
    const duration = input.duration as string | undefined;
    const expiresAt = computeExpiry(duration);

    const rule = addRule({
      subsystem,
      action,
      conditions,
      description,
      rawInput: input._rawMessage || "",
      expiresAt,
    });

    const actionLabel: Record<RuleAction, string> = {
      block: "חסימה",
      allow: "אישור",
      mute: "השתקה",
    };

    const expiryText = expiresAt
      ? `⏰ עד ${new Date(expiresAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
      : "♾️ לצמיתות";

    return `✅ כלל תפעולי נשמר!\n${actionLabel[action]}: ${description}\n${expiryText}`;
  },

  remove_operational_rule: async (input) => {
    return removeRule(input.query);
  },

  list_operational_rules: async (input) => {
    const subsystem = input.subsystem as RuleSubsystem | undefined;
    return formatRulesList(subsystem);
  },
};
