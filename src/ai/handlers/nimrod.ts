/**
 * Nimrod Cyber Agent — Tool Handlers
 */
import type { ToolHandler } from "./types";
import {
  runFullScan,
  runScanProcesses,
  runScanPersistence,
  runScanNetwork,
  runScanFilesystem,
  runScanPermissions,
  getAlerts,
} from "../../agents/nimrod/index";

export const nimrodHandlers: Record<string, ToolHandler> = {
  nimrod_run_scan: async () => {
    return await runFullScan();
  },

  nimrod_scan_processes: async () => {
    return await runScanProcesses();
  },

  nimrod_scan_persistence: async () => {
    return await runScanPersistence();
  },

  nimrod_scan_network: async () => {
    return await runScanNetwork();
  },

  nimrod_scan_filesystem: async () => {
    return await runScanFilesystem();
  },

  nimrod_scan_permissions: async () => {
    return await runScanPermissions();
  },

  nimrod_get_alerts: async (input) => {
    const limit = input.limit || 20;
    return getAlerts(limit);
  },
};
