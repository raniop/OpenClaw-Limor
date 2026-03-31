/**
 * Office PC remote login handler.
 * Uses SSH (via Tailscale) to check status, login, or restart the office Windows PC.
 * Supports key-based auth (works before Windows login) with password fallback.
 */
import { Client } from "ssh2";
import { readFileSync } from "fs";
import { config } from "../../config";
import type { ToolHandler } from "./types";

function getPrivateKey(): Buffer | undefined {
  if (!config.officePcKeyPath) return undefined;
  try {
    return readFileSync(config.officePcKeyPath);
  } catch {
    return undefined;
  }
}

function sshExec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const host = config.officePcHost;
    const username = config.officePcUser;
    const password = config.officePcPass;
    const privateKey = getPrivateKey();

    if (!host || !username || (!password && !privateKey)) {
      return reject(new Error("Office PC credentials not configured in .env"));
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      conn.end();
      if (!settled) { settled = true; reject(new Error("SSH connection timeout (15s)")); }
    }, 15000);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { clearTimeout(timeout); conn.end(); if (!settled) { settled = true; reject(err); } return; }
          stream
            .on("close", (code: number) => {
              clearTimeout(timeout);
              conn.end();
              if (!settled) { settled = true; resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code || 0 }); }
            })
            .on("data", (data: Buffer) => { stdout += data.toString(); })
            .stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
        });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(err); }
      })
      .connect({
        host, port: 22, username,
        ...(privateKey ? { privateKey } : {}),
        ...(password ? { password } : {}),
        readyTimeout: 10000,
      });
  });
}

async function getStatus(): Promise<string> {
  try {
    const result = await sshExec("query user");
    if (result.stdout.includes("Active")) {
      const lines = result.stdout.split("\n").filter(l => l.includes("Active"));
      const match = lines[0]?.match(/(\S+)\s+(\S+)\s+(\d+)\s+Active/);
      const user = match?.[1] || "unknown";
      return [
        "\u2705 \u05D4\u05DE\u05D7\u05E9\u05D1 \u05D1\u05DE\u05E9\u05E8\u05D3 \u05D3\u05DC\u05D5\u05E7 \u05D5\u05DE\u05D7\u05D5\u05D1\u05E8.",
        "\uD83D\uDC64 \u05DE\u05E9\u05EA\u05DE\u05E9: " + user,
        "\uD83D\uDCBB \u05E1\u05D8\u05D8\u05D5\u05E1: Active (\u05D3\u05E1\u05E7\u05D8\u05D5\u05E4 \u05E4\u05E2\u05D9\u05DC)",
      ].join("\n");
    }
    return "\u2705 \u05D4\u05DE\u05D7\u05E9\u05D1 \u05D3\u05DC\u05D5\u05E7 \u05D0\u05D1\u05DC \u05D0\u05D9\u05DF \u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D7\u05D5\u05D1\u05E8 (\u05DE\u05E1\u05DA login).";
  } catch (err: any) {
    if (err.message?.includes("ECONNREFUSED") || err.message?.includes("EHOSTUNREACH") || err.message?.includes("timeout")) {
      return "\u274C \u05D4\u05DE\u05D7\u05E9\u05D1 \u05D1\u05DE\u05E9\u05E8\u05D3 \u05DB\u05D1\u05D5\u05D9 \u05D0\u05D5 \u05DC\u05D0 \u05E0\u05D2\u05D9\u05E9.";
    }
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D7\u05D9\u05D1\u05D5\u05E8: " + err.message;
  }
}

async function doLogin(): Promise<string> {
  // Step 1: Check if already logged in
  try {
    const check = await sshExec("query user");
    if (check.stdout.includes("Active")) {
      return "\u2705 \u05D4\u05DE\u05D7\u05E9\u05D1 \u05DB\u05D1\u05E8 \u05DE\u05D7\u05D5\u05D1\u05E8 \u05E2\u05DD \u05DE\u05E9\u05EA\u05DE\u05E9 \u05E4\u05E2\u05D9\u05DC.";
    }
  } catch (err: any) {
    return "\u274C \u05DC\u05D0 \u05DE\u05E6\u05DC\u05D9\u05D7\u05D4 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC\u05DE\u05D7\u05E9\u05D1: " + err.message;
  }

  // Step 2: Set auto-logon registry keys
  const parts = config.officePcUser.split("\\");
  const domain = parts.length > 1 ? parts[0] : "";
  const user = parts.length > 1 ? parts[1] : parts[0];
  const pass = config.officePcPass;
  const regPath = "'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'";

  const setAutoLogon = [
    "Set-ItemProperty -Path " + regPath + " -Name AutoAdminLogon -Value '1'",
    "Set-ItemProperty -Path " + regPath + " -Name DefaultUserName -Value '" + user + "'",
    "Set-ItemProperty -Path " + regPath + " -Name DefaultDomainName -Value '" + domain + "'",
    "Set-ItemProperty -Path " + regPath + " -Name DefaultPassword -Value '" + pass + "'",
  ].join("; ");

  try {
    await sshExec(setAutoLogon);
  } catch (err: any) {
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D4\u05D2\u05D3\u05E8\u05EA auto-logon: " + err.message;
  }

  // Step 3: Create cleanup script + scheduled task
  const cleanupLines = [
    "Remove-ItemProperty -Path " + regPath + " -Name DefaultPassword -ErrorAction SilentlyContinue",
    "Set-ItemProperty -Path " + regPath + " -Name AutoAdminLogon -Value '0'",
    "Unregister-ScheduledTask -TaskName 'LimorAutoLogonCleanup' -Confirm:$false",
    "Remove-Item -Path 'C:\\limor-cleanup.ps1' -ErrorAction SilentlyContinue",
  ];

  try {
    // Write cleanup script to disk
    const writeScript = "Set-Content -Path 'C:\\limor-cleanup.ps1' -Value '" + cleanupLines.join("; ") + "'";
    await sshExec(writeScript);
    // Register scheduled task to run at logon
    const registerTask = "Register-ScheduledTask -TaskName 'LimorAutoLogonCleanup' -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -File C:\\limor-cleanup.ps1') -Trigger (New-ScheduledTaskTrigger -AtLogOn) -RunLevel Highest -Force";
    await sshExec(registerTask);
  } catch (err: any) {
    console.warn("[office-pc] cleanup task creation failed (non-critical):", err.message);
  }

  // Step 4: Trigger quick restart
  try {
    await sshExec("shutdown /r /t 5 /f");
  } catch (err: any) {
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D4\u05E4\u05E2\u05DC\u05D4 \u05DE\u05D7\u05D3\u05E9: " + err.message;
  }

  return "\uD83D\uDD04 \u05DE\u05E4\u05E2\u05D9\u05DC\u05D4 \u05DE\u05D7\u05D3\u05E9 \u05D0\u05EA \u05D4\u05DE\u05D7\u05E9\u05D1 \u05D1\u05DE\u05E9\u05E8\u05D3...\n\u05D4\u05DE\u05D7\u05E9\u05D1 \u05D9\u05D9\u05DB\u05E0\u05E1 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05EA\u05D5\u05DA ~30 \u05E9\u05E0\u05D9\u05D5\u05EA.\n\u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05EA\u05D9\u05DE\u05D7\u05E7 \u05DE\u05D4\u05E8\u05D2\u05D9\u05E1\u05D8\u05E8\u05D9 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05DB\u05E0\u05D9\u05E1\u05D4.";
}

async function doUnlock(): Promise<string> {
  try {
    const check = await sshExec("query user");
    if (!check.stdout.includes("Active") && !check.stdout.includes("Disc")) {
      return "\u274C \u05D0\u05D9\u05DF \u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D7\u05D5\u05D1\u05E8. \u05EA\u05E0\u05E1\u05D4 login \u05E7\u05D5\u05D3\u05DD.";
    }
  } catch (err: any) {
    return "\u274C \u05DC\u05D0 \u05DE\u05E6\u05DC\u05D9\u05D7\u05D4 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC\u05DE\u05D7\u05E9\u05D1: " + err.message;
  }

  // Disable auto-lock, logoff, let auto-logon bring desktop back unlocked, then re-enable auto-lock
  try {
    await sshExec("Disable-ScheduledTask -TaskName 'AutoLockAfterLogon' -ErrorAction SilentlyContinue");
    await sshExec("logoff console");
    // Wait for auto-logon to complete, then re-enable auto-lock
    setTimeout(async () => {
      try {
        await sshExec("Enable-ScheduledTask -TaskName 'AutoLockAfterLogon' -ErrorAction SilentlyContinue");
      } catch { /* ignore */ }
    }, 20000);
    return "\uD83D\uDD13 \u05E4\u05D5\u05EA\u05D7\u05EA \u05E0\u05E2\u05D9\u05DC\u05D4...\n\u05D4\u05DE\u05D7\u05E9\u05D1 \u05DE\u05EA\u05E0\u05EA\u05E7 \u05D5\u05E0\u05DB\u05E0\u05E1 \u05DE\u05D7\u05D3\u05E9 \u05DC\u05DC\u05D0 \u05E0\u05E2\u05D9\u05DC\u05D4 \u05EA\u05D5\u05DA ~15 \u05E9\u05E0\u05D9\u05D5\u05EA.";
  } catch (err: any) {
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E4\u05EA\u05D9\u05D7\u05EA \u05D4\u05DE\u05E1\u05DA: " + err.message;
  }
}

async function doLock(): Promise<string> {
  try {
    await sshExec("Enable-ScheduledTask -TaskName 'AutoLockAfterLogon' -ErrorAction SilentlyContinue");
    // Lock via a one-time scheduled task that runs in the interactive session
    await sshExec("$a = New-ScheduledTaskAction -Execute 'rundll32.exe' -Argument 'user32.dll,LockWorkStation'; $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); Register-ScheduledTask -TaskName 'LimorLockNow' -Action $a -Trigger $t -RunLevel Highest -Force | Out-Null");
    // Wait for it to run, then clean up
    await new Promise(r => setTimeout(r, 4000));
    await sshExec("Unregister-ScheduledTask -TaskName 'LimorLockNow' -Confirm:$false -ErrorAction SilentlyContinue");
    return "\uD83D\uDD12 \u05D4\u05DE\u05E1\u05DA \u05E0\u05E0\u05E2\u05DC.";
  } catch (err: any) {
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E0\u05E2\u05D9\u05DC\u05EA \u05D4\u05DE\u05E1\u05DA: " + err.message;
  }
}

async function doRestart(): Promise<string> {
  try {
    await sshExec("shutdown /r /t 5 /f");
    return "\uD83D\uDD04 \u05D4\u05DE\u05D7\u05E9\u05D1 \u05D1\u05DE\u05E9\u05E8\u05D3 \u05DE\u05D5\u05E4\u05E2\u05DC \u05DE\u05D7\u05D3\u05E9.";
  } catch (err: any) {
    return "\u274C \u05E9\u05D2\u05D9\u05D0\u05D4: " + err.message;
  }
}

// Users allowed to use the office PC tool (besides the owner)
const ALLOWED_USERS = ["orit cohen"];

export const officePcHandlers: Record<string, ToolHandler> = {
  office_pc_login: async (input, sender) => {
    const { action } = input;

    // Permission check: owner or allowed users only
    if (!sender?.isOwner) {
      const name = (sender?.name || "").toLowerCase();
      if (!ALLOWED_USERS.includes(name)) {
        return "\u274C \u05D0\u05D9\u05DF \u05DC\u05DA \u05D4\u05E8\u05E9\u05D0\u05D4 \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05DB\u05DC\u05D9 \u05D4\u05D6\u05D4.";
      }
    }

    switch (action) {
      case "status":
        return getStatus();
      case "login":
        return doLogin();
      case "unlock":
        return doUnlock();
      case "lock":
        return doLock();
      case "restart":
        return doRestart();
      default:
        return "\u274C \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA: " + action;
    }
  },
};
