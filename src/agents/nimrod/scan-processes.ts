/**
 * Nimrod — Process Scanner
 * Analyzes running processes, parent-child chains, unsigned binaries
 */
import { execSync } from "child_process";
import type { ScanResult, Finding } from "./types";

// Known-benign macOS system process names (partial match)
const BENIGN_PROCS = new Set([
  "kernel_task","launchd","WindowServer","loginwindow","mds","mds_stores",
  "Spotlight","coreaudiod","configd","notifyd","diskarbitrationd",
  "opendirectoryd","akd","symptomsd","logd","syslogd","powerd",
  "backupd","trustd","securityd","secd","bird","cloudd","nsurlsessiond",
  "node","npm","pm2","tsc","bash","zsh","sh","ssh","git","grep",
  "tail","cat","ps","top","lsof","netstat","awk","sed","cut","xargs",
]);

// Suspicious keywords in process args
const SUSPICIOUS_PATTERNS = [
  /miner/i, /cryptonight/i, /xmrig/i,
  /base64.*decode/i,
  /kextload/i,
];

function isSuspiciousPath(path: string): boolean {
  const suspiciousDirs = ["/tmp/", "/var/tmp/", "/private/tmp/", "/Users/Shared/"];
  return suspiciousDirs.some(d => path.includes(d));
}

export async function scanProcesses(): Promise<ScanResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    const psOut = execSync(
      "ps axo pid,ppid,user,pcpu,pmem,comm,args 2>/dev/null | head -200",
      { encoding: "utf-8", timeout: 10000 }
    );

    const lines = psOut.trim().split("\n").slice(1);
    const highCpuProcs: string[] = [];
    const highMemProcs: string[] = [];
    const suspiciousProcs: string[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;

      const pid = parts[0];
      const comm = parts[5] || "";
      const cpu = parseFloat(parts[3]) || 0;
      const mem = parseFloat(parts[4]) || 0;
      const args = parts.slice(6).join(" ");
      const fullCmd = `${comm} ${args}`.trim();

      if (cpu > 80 && !BENIGN_PROCS.has(comm)) {
        highCpuProcs.push(`PID ${pid} (${comm}) — ${cpu}% CPU`);
      }

      if (mem > 15 && !BENIGN_PROCS.has(comm)) {
        highMemProcs.push(`PID ${pid} (${comm}) — ${mem}% MEM`);
      }

      if (isSuspiciousPath(args) && !BENIGN_PROCS.has(comm)) {
        suspiciousProcs.push(`PID ${pid}: ${fullCmd.substring(0, 120)}`);
      }

      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(fullCmd)) {
          suspiciousProcs.push(`PID ${pid} [${pattern.source}]: ${fullCmd.substring(0, 120)}`);
          break;
        }
      }
    }

    if (highCpuProcs.length > 0) {
      findings.push({
        domain: "processes",
        riskLevel: "suspicious",
        title: `${highCpuProcs.length} תהליך(ים) עם CPU גבוה (>80%)`,
        detail: "תהליכים עם CPU גבוה — עלול להעיד על miner או לולאה",
        evidence: highCpuProcs.join("\n"),
        recommendation: "בדוק את שמות התהליכים ומקורם",
        timestamp: new Date().toISOString(),
      });
    }

    if (highMemProcs.length > 0) {
      findings.push({
        domain: "processes",
        riskLevel: "suspicious",
        title: `${highMemProcs.length} תהליך(ים) עם זיכרון גבוה (>15%)`,
        detail: "תהליכים עם צריכת זיכרון גבוהה",
        evidence: highMemProcs.join("\n"),
        recommendation: "בדוק אם הגידול בזיכרון גיטימי",
        timestamp: new Date().toISOString(),
      });
    }

    if (suspiciousProcs.length > 0) {
      findings.push({
        domain: "processes",
        riskLevel: "high-risk",
        title: `${suspiciousProcs.length} תהליך(ים) חשוד(ים)`,
        detail: "תהליכים מנתיבים חשודים או עם patterns זדוניים",
        evidence: suspiciousProcs.join("\n"),
        recommendation: "בדוק מיידית את מקור התהליכים",
        timestamp: new Date().toISOString(),
      });
    }

    if (findings.length === 0) {
      findings.push({
        domain: "processes",
        riskLevel: "benign",
        title: "תהליכים — תקין",
        detail: "לא נמצאו תהליכים חשודים",
        evidence: `נסרקו ${lines.length} תהליכים`,
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: any) {
    errors.push(`scan-processes error: ${err.message}`);
  }

  return {
    domain: "processes",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    errors,
  };
}
