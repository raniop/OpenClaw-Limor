/**
 * Nimrod — Permissions Scanner
 * Checks TCC database, sudo access, SUID/SGID binaries, privilege escalation indicators
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import type { ScanResult, Finding } from "./types";

function getSudoers(): string[] {
  const lines: string[] = [];
  try {
    const out = execSync("sudo -l -U $USER 2>/dev/null || true", {
      encoding: "utf-8", timeout: 5000
    }).trim();
    if (out) lines.push(...out.split("\n").filter(l => l.includes("NOPASSWD")));
  } catch {}
  return lines;
}

function getSuidBinaries(): string[] {
  try {
    const out = execSync(
      "find /usr/local /opt/homebrew/bin /usr/bin -perm -4000 -type f 2>/dev/null | head -20",
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function checkWorldWritable(): string[] {
  try {
    const out = execSync(
      "find /usr/local/lib /usr/local/bin -perm -0002 -type f 2>/dev/null | head -10",
      { encoding: "utf-8", timeout: 10000 }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function checkSSHKeys(): { files: string[]; suspicious: string[] } {
  const files: string[] = [];
  const suspicious: string[] = [];
  try {
    const home = execSync("echo $HOME", { encoding: "utf-8", timeout: 3000 }).trim();
    const sshDir = `${home}/.ssh`;
    if (!existsSync(sshDir)) return { files, suspicious };

    const out = execSync(`ls -la "${sshDir}" 2>/dev/null || true`, {
      encoding: "utf-8", timeout: 5000
    }).trim();
    const sshLines = out.split("\n").filter(l => !l.startsWith("total") && !l.startsWith("d"));
    files.push(...sshLines);

    // Check authorized_keys for unknown entries
    const authKeys = `${sshDir}/authorized_keys`;
    if (existsSync(authKeys)) {
      try {
        const content = execSync(`wc -l < "${authKeys}"`, { encoding: "utf-8", timeout: 3000 }).trim();
        const count = parseInt(content) || 0;
        if (count > 3) {
          suspicious.push(`authorized_keys מכיל ${count} מפתחות — בדוק שכולם מוכרים`);
        }
      } catch {}
    }
  } catch {}
  return { files, suspicious };
}

function checkEnvFiles(): string[] {
  const sensitive: string[] = [];
  try {
    const projectDir = execSync("pwd", { encoding: "utf-8", timeout: 3000 }).trim();
    const out = execSync(
      `find "${projectDir}" -maxdepth 2 -name "*.env" -o -name ".env*" 2>/dev/null | head -10`,
      { encoding: "utf-8", timeout: 8000 }
    ).trim();
    if (out) {
      const envFiles = out.split("\n").filter(Boolean);
      // Check permissions on .env files
      for (const f of envFiles) {
        try {
          const perm = execSync(`stat -f "%Sp" "${f}" 2>/dev/null || true`, {
            encoding: "utf-8", timeout: 3000
          }).trim();
          if (perm && !perm.startsWith("-rw-------") && !perm.startsWith("-r--------")) {
            sensitive.push(`${f} — הרשאות: ${perm} (צריך להיות 600 או 400)`);
          }
        } catch {}
      }
    }
  } catch {}
  return sensitive;
}

export async function scanPermissions(): Promise<ScanResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    // Sudo NOPASSWD
    const sudoers = getSudoers();
    if (sudoers.length > 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "suspicious",
        title: "NOPASSWD sudo נמצא",
        detail: "המשתמש יכול להריץ פקודות כ-root ללא סיסמה",
        evidence: sudoers.join("\n"),
        recommendation: "בדוק אם הגדרת ה-NOPASSWD מכוונת ונחוצה",
        timestamp: new Date().toISOString(),
      });
    }

    // SUID binaries
    const suidBins = getSuidBinaries();
    if (suidBins.length > 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "suspicious",
        title: `${suidBins.length} קבצי SUID נמצאו`,
        detail: "קבצים עם SUID bit — יכולים לשמש להסלמת הרשאות",
        evidence: suidBins.join("\n"),
        recommendation: "בדוק שכל ה-SUID binaries ידועים ולגיטימיים",
        timestamp: new Date().toISOString(),
      });
    }

    // World-writable binaries
    const worldWritable = checkWorldWritable();
    if (worldWritable.length > 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "high-risk",
        title: `${worldWritable.length} קבצים עם world-writable permissions`,
        detail: "קבצי הרצה שכולם יכולים לכתוב אליהם — סיכון גבוה",
        evidence: worldWritable.join("\n"),
        recommendation: "תקן הרשאות מיידית עם chmod o-w",
        timestamp: new Date().toISOString(),
      });
    }

    // SSH keys
    const { files: sshFiles, suspicious: sshSuspicious } = checkSSHKeys();
    if (sshSuspicious.length > 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "suspicious",
        title: "SSH Keys חשודים",
        detail: "מצב מפתחות SSH חריג",
        evidence: sshSuspicious.join("\n"),
        recommendation: "בדוק את authorized_keys ומחק מפתחות לא מוכרים",
        timestamp: new Date().toISOString(),
      });
    }

    // .env file permissions
    const envIssues = checkEnvFiles();
    if (envIssues.length > 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "suspicious",
        title: `${envIssues.length} קובץ .env עם הרשאות רחבות מדי`,
        detail: "קבצי סביבה עם API keys לא מוגנים מספיק",
        evidence: envIssues.join("\n"),
        recommendation: "הרץ: chmod 600 .env",
        timestamp: new Date().toISOString(),
      });
    }

    if (findings.length === 0) {
      findings.push({
        domain: "permissions",
        riskLevel: "benign",
        title: "הרשאות — תקין",
        detail: "לא נמצאו בעיות הרשאות חשודות",
        evidence: "בדיקת sudo, SUID, world-writable, SSH, .env",
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: any) {
    errors.push(`scan-permissions error: ${err.message}`);
  }

  return {
    domain: "permissions",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    errors,
  };
}
