/**
 * Nimrod Cyber Agent — Shared Types
 * Risk classification, findings, alerts
 */

export type RiskLevel = "benign" | "suspicious" | "high-risk";

export interface Finding {
  domain: string;           // processes | persistence | network | filesystem | permissions
  riskLevel: RiskLevel;
  title: string;
  detail: string;
  evidence: string;
  recommendation: string;
  timestamp: string;
}

export interface ScanResult {
  domain: string;
  scannedAt: string;
  durationMs: number;
  findings: Finding[];
  errors: string[];
}

export interface NimrodAlert {
  id: string;
  createdAt: string;
  riskLevel: RiskLevel;
  domain: string;
  title: string;
  detail: string;
  evidence: string;
  acknowledged: boolean;
}

export interface NimrodState {
  lastFullScan: string | null;
  alertsThisHour: number;
  alertsHourStart: string | null;
  alerts: NimrodAlert[];
}
