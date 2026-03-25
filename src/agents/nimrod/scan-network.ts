/**
 * Nimrod — Network Scanner
 * Checks listening services, active connections, suspicious external comms
 */
import { execSync } from "child_process";
import type { ScanResult, Finding } from "./types";

// Ports that are legitimately used by the limor system
const KNOWN_LEGIT_PORTS = new Set([
  22, 80, 443, 3000, 3001, 8080, 8443, 5432, 6379,
  5900, 5901,  // VNC
  53,          // DNS
]);

// Known suspicious external ports
const SUSPICIOUS_REMOTE_PORTS = new Set([
  4444, 4445, 1234, 31337, 8888, 9999, 6667, 6668, 6669,
]);

function parseLsof(output: string): Array<{
  command: string; pid: string; type: string;
  localAddr: string; remoteAddr: string; state: string;
}> {
  const results: any[] = [];
  const lines = output.trim().split("\n").slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    results.push({
      command: parts[0],
      pid: parts[1],
      type: parts[4],
      localAddr: parts[8] || "",
      remoteAddr: parts[9] || "",
      state: parts[10] || "",
    });
  }
  return results;
}

function extractPort(addr: string): number {
  const parts = addr.split(":");
  return parseInt(parts[parts.length - 1]) || 0;
}

function isPrivateIP(ip: string): boolean {
  return (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("::1") ||
    ip === "localhost" ||
    ip === "*"
  );
}

export async function scanNetwork(): Promise<ScanResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    // Listening services
    let listeningOutput = "";
    try {
      listeningOutput = execSync(
        "lsof -i -n -P 2>/dev/null | grep LISTEN | head -50",
        { encoding: "utf-8", timeout: 15000 }
      );
    } catch {}

    const listeningLines = listeningOutput.trim().split("\n").filter(Boolean);
    const unusualListeners: string[] = [];

    for (const line of listeningLines) {
      const parts = line.trim().split(/\s+/);
      const command = parts[0] || "";
      const addr = parts[8] || "";
      const port = extractPort(addr);

      if (port > 0 && !KNOWN_LEGIT_PORTS.has(port) && port < 1024) {
        unusualListeners.push(`${command} listening on port ${port} (${addr})`);
      }
    }

    if (unusualListeners.length > 0) {
      findings.push({
        domain: "network",
        riskLevel: "suspicious",
        title: `${unusualListeners.length} שירות(ים) מאזינים על פורטים לא מוכרים`,
        detail: "שירותים מאזינים על פורטים מתחת ל-1024 שלא ברשימת הלגיטימיים",
        evidence: unusualListeners.join("\n"),
        recommendation: "בדוק מי פתח את הפורטים האלה",
        timestamp: new Date().toISOString(),
      });
    }

    // Active established connections to external IPs
    let connOutput = "";
    try {
      connOutput = execSync(
        "lsof -i -n -P 2>/dev/null | grep ESTABLISHED | head -80",
        { encoding: "utf-8", timeout: 15000 }
      );
    } catch {}

    const connLines = connOutput.trim().split("\n").filter(Boolean);
    const suspiciousConns: string[] = [];

    for (const line of connLines) {
      const parts = line.trim().split(/\s+/);
      const command = parts[0] || "";
      const addr = parts[8] || "";

      const arrowIdx = addr.indexOf("->");
      if (arrowIdx === -1) continue;

      const remote = addr.substring(arrowIdx + 2);
      const remoteIP = remote.split(":")[0];
      const remotePort = extractPort(remote);

      if (!isPrivateIP(remoteIP) && SUSPICIOUS_REMOTE_PORTS.has(remotePort)) {
        suspiciousConns.push(`${command} → ${remote}`);
      }
    }

    if (suspiciousConns.length > 0) {
      findings.push({
        domain: "network",
        riskLevel: "high-risk",
        title: `${suspiciousConns.length} חיבור(ים) לפורטים חשודים`,
        detail: "חיבורים פעילים לפורטים המשויכים לכלי תקיפה / C2",
        evidence: suspiciousConns.join("\n"),
        recommendation: "חקור מיידית — עשוי להיות backdoor או C2 channel",
        timestamp: new Date().toISOString(),
      });
    }

    // Summary of listening ports
    if (listeningLines.length > 0 && unusualListeners.length === 0) {
      findings.push({
        domain: "network",
        riskLevel: "benign",
        title: `רשת — תקין (${listeningLines.length} שירותים מאזינים)`,
        detail: "כל השירותים המאזינים ברשימת הלגיטימיים",
        evidence: listeningLines.slice(0, 10).join("\n"),
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    } else if (listeningLines.length === 0 && findings.length === 0) {
      findings.push({
        domain: "network",
        riskLevel: "benign",
        title: "רשת — לא נמצאו שירותים מאזינים",
        detail: "lsof לא החזיר שירותים מאזינים",
        evidence: "אין נתונים",
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: any) {
    errors.push(`scan-network error: ${err.message}`);
  }

  return {
    domain: "network",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    errors,
  };
}
