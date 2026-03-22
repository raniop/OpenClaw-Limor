import {
  searchPolicyByPersonId,
  getPolicyDetails,
  getPolicyCustomers,
  getTopPolicies,
  getDashboard,
  getAgentsReport,
  sendSms,
} from "../../crm";
import type { ToolHandler } from "./types";

export const crmHandlers: Record<string, ToolHandler> = {
  crm_search_policy: async (input) => {
    return await searchPolicyByPersonId(input.person_id);
  },

  crm_policy_details: async (input) => {
    return await getPolicyDetails(input.policy_index);
  },

  crm_policy_customers: async (input) => {
    return await getPolicyCustomers(input.policy_index);
  },

  crm_dashboard: async (input) => {
    return await getDashboard(input.month, input.year);
  },

  crm_top_policies: async (input) => {
    return await getTopPolicies(input.top || 10);
  },

  crm_agents_report: async (input) => {
    return await getAgentsReport(input.page || 1, input.page_size || 50);
  },

  crm_send_sms: async (input) => {
    return await sendSms(input.mobile, input.message);
  },
};
