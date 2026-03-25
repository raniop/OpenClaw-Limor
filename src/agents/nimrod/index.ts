/**
 * Nimrod Cyber Agent — Main Orchestrator
 * Coordinates all detection modules and produces unified scan reports
 */
import { v4 as uuidv4 } from "uuid";
import type { ScanResult, Finding, NimrodAlert, NimrodState } from "./types";
import { scanProcesses } from "./scan-processes";
import { scanPersistence } from "./scan-persistence";
import { scanNetwork } from "./scan-network";
import { scanFilesystem } from "./scan-filesystem";
import { scanPermissions } from "./scan-permissions";
import { loadState, saveState, canSendAlert, recordAlert } from "./state";

export type { ScanResult, Finding, NimrodAlert, NimrodState };

// ─── Risk Scoring ───────────────────────────────────────────────────────────

const RISK_SCORE: Record<string, number> = {
  "benign": 0,
  "suspicious": 5,
  "high-risk": 20,
};

const EMOJI: Record<string, string> = {
  "benign": "🟢",
  "suspicious": "🟠",
  "high-risk": "🔴",
};

function computeRiskScore(findings: Finding[]): number {
  return findings.reduce((sum, f) => sum + (RISK_SCORE[f.riskLevel] || 0), 0);
}

function formatFinding(f: Finding): string {
  return `${EMOJI[f.riskLevel] || "⚪"} [${f.domain}] ${f.title}\n   ${f.detail}\n   📋 עדות: ${f.evidence.substring(0, 200)}\n   💡 ${f.recommendation}`;
}

// ─── Full Scan ───────────────────────────────────────────────────────────────

export async function runFullScan(): Promise<string> {
  const start = Date.now();
  const state = loadState();

  // Run all modules in parallel
  const [processes, persistence, network, filesystem, permissions] = await Promise.all([
    scanProcesses().catch(err => ({ domain: "processes", scannedAt: new Date().toISOString(), durationMs: 0, findings: [], errors: [String(err)] } as ScanResult)),
    scanPersistence().catch(err => ({ domain: "persistence", scannedAt: new Date().toISOString(), durationMs: 0, findings: [], errors: [String(err)] } as ScanResult)),
    scanNetwork().catch(err => ({ domain: "network", scannedAt: new Date().toISOString(), durationMs: 0, findings: [], errors: [String(err)] } as ScanResult)),
    scanFilesystem().catch(err => ({ domain: "filesystem", scannedAt: new Date().toISOString(), durationMs: 0, findings: [], errors: [String(err)] } as ScanResult)),
    scanPermissions().catch(err => ({ domain: "permissions", scannedAt: new Date().toISOString(), durationMs: 0, findings: [], errors: [String(err)] } as ScanResult)),
  ]);

  const allResults = [processes, persistence, network, filesystem, permissions];
  const allFindings = allResults.flatMap(r => r.findings);
  const allErrors = allResults.flatMap(r => r.errors);

  const totalScore = computeRiskScore(allFindings);
  const highRisk = allFindings.filter(f => f.riskLevel === "high-risk");
  const suspicious = allFindings.filter(f => f.riskLevel === "suspicious");
  const benign = allFindings.filter(f => f.riskLevel === "benign");

  // Generate alerts for high-risk findings
  const newAlerts: NimrodAlert[] = [];
  for (const finding of highRisk) {
    if (canSendAlert(state)) {
      const alert: NimrodAlert = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        riskLevel: finding.riskLevel,
        domain: finding.domain,
        title: finding.title,
        detail: finding.detail,
        evidence: finding.evidence.substring(0, 500),
        acknowledged: false,
      };
      recordAlert(state, alert);
      newAlerts.push(alert);
    }
  }

  // Also alert for suspicious with score > 15
  if (totalScore > 15 && newAlerts.length === 0 && canSendAlert(state)) {
    const alert: NimrodAlert = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      riskLevel: "suspicious",
      domain: "correlation",
      title: `ציון סיכון גבוה: ${totalScore} — ${suspicious.length} ממצאים חשודים`,
      detail: "מספר ממצאים חשודים בו-זמנית מעלים את רמת הסיכון הכוללת",
      evidence: suspicious.map(f => f.title).join("; "),
      acknowledged: false,
    };
    recordAlert(state, alert);
    newAlerts.push(alert);
  }

  state.lastFullScan = new Date().toISOString();
  saveState(state);

  // Build report
  const durationMs = Date.now() - start;
  const lines: string[] = [
    `🔐 *דוח סייבר — נמרוד*`,
    `⏱️ משך סריקה: ${Math.round(durationMs / 1000)}s | ציון סיכון: ${totalScore}`,
    ``,
    `📊 סיכום: ${allFindings.length} ממצאים | 🔴 ${highRisk.length} קריטי | 🟠 ${suspicious.length} חשוד | 🟢 ${benign.length} תקין`,
    ``,
  ];

  if (highRisk.length > 0) {
    lines.push(`🔴 *ממצאים קריטיים (${highRisk.length}):*`);
    highRisk.forEach(f => lines.push(formatFinding(f)));
    lines.push(``);
  }

  if (suspicious.length > 0) {
    lines.push(`🟠 *ממצאים חשודים (${suspicious.length}):*`);
    suspicious.forEach(f => lines.push(formatFinding(f)));
    lines.push(``);
  }

  if (benign.length > 0 && highRisk.length === 0 && suspicious.length === 0) {
    lines.push(`🟢 *כל הדומיינים תקינים*`);
    benign.forEach(f => lines.push(`  ✅ [${f.domain}] ${f.title}`));
    lines.push(``);
  }

  if (newAlerts.length > 0) {
    lines.push(`🚨 *${newAlerts.length} התראות נוצרו ונשמרו*`);
  }

  if (allErrors.length > 0) {
    lines.push(`⚠️ שגיאות סריקה: ${allErrors.join(" | ")}`);
  }

  return lines.join("\n");
}

// ─── Individual Scans ─────────────────────────────────────────────────────────

export async function runScanProcesses(): Promise<string> {
  const result = await scanProcesses();
  return formatScanResult(result);
}

export async function runScanPersistence(): Promise<string> {
  const result = await scanPersistence();
  return formatScanResult(result);
}

export async function runScanNetwork(): Promise<string> {
  const result = await scanNetwork();
  return formatScanResult(result);
}

export async function runScanFilesystem(): Promise<string> {
  const result = await scanFilesystem();
  return formatScanResult(result);
}

export async function runScanPermissions(): Promise<string> {
  const result = await scanPermissions();
  return formatScanResult(result);
}

function formatScanResult(result: ScanResult): string {
  const lines: string[] = [
    `🔐 סריקת ${result.domain} | ${new Date(result.scannedAt).toLocaleString("he-IL")} | ${result.durationMs}ms`,
    ``,
  ];
  for (const f of result.findings) {
    lines.push(formatFinding(f));
    lines.push(``);
  }
  if (result.errors.length > 0) {
    lines.push(`⚠️ שגיאות: ${result.errors.join(", ")}`);
  }
  return lines.join("\n");
}

// ─── Get Alerts ───────────────────────────────────────────────────────────────

export function getAlerts(limit = 20): string {
  const state = loadState();
  const alerts = state.alerts.slice(0, limit);

  if (alerts.length === 0) return "🟢 אין התראות שמורות";

  const lines = [`🔐 *התראות שמורות (${alerts.length}):*`, ``];
  for (const a of alerts) {
    const status = a.acknowledged ? "✅" : "🔔";
    lines.push(`${status} ${EMOJI[a.riskLevel]} [${a.domain}] ${a.title}`);
    lines.push(`   ${new Date(a.createdAt).toLocaleString("he-IL")}`);
    lines.push(`   ${a.detail}`);
    lines.push(``);
  }

  lines.push(`📊 מצב throttle: ${state.alertsThisHour || 0}/3 התראות השעה`);
  return lines.join("\n");
}
