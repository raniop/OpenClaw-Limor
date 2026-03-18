/**
 * Control4 Smart Home integration.
 * Authenticates via Control4 Cloud API, controls devices via local Director REST API (over Tailscale VPN).
 */
import { config } from "./config";

const C4_AUTH_URL = "https://apis.control4.com/authentication/v1/rest";
const C4_DIRECTOR_AUTH_URL = "https://apis.control4.com/authentication/v1/rest/authorization";
const C4_APP_KEY = "78f6791373d61bea49fdb9fb8897f1f3af193f11";

// Token cache
let directorToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a valid Director bearer token, refreshing if needed.
 */
async function getDirectorToken(): Promise<string> {
  if (directorToken && Date.now() < tokenExpiresAt) {
    return directorToken;
  }

  // Step 1: Account auth
  const authRes = await fetch(C4_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientInfo: {
        device: { deviceName: "Limor", deviceUUID: "limor-bot-c4-001", make: "Limor", model: "Limor", os: "Android", osVersion: "10" },
        userInfo: { applicationKey: C4_APP_KEY, password: config.control4Password, userName: config.control4Username },
      },
    }),
  });

  if (!authRes.ok) throw new Error(`C4 auth failed: ${authRes.status}`);
  const authData = await authRes.json() as any;
  const accountToken = authData.authToken.token;

  // Step 2: Director auth
  const dirRes = await fetch(C4_DIRECTOR_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountToken}` },
    body: JSON.stringify({
      serviceInfo: { commonName: config.control4CommonName, services: "director" },
    }),
  });

  if (!dirRes.ok) throw new Error(`C4 director auth failed: ${dirRes.status}`);
  const dirData = await dirRes.json() as any;
  directorToken = dirData.authToken.token;
  const validSeconds = dirData.authToken.validSeconds || 86400;
  tokenExpiresAt = Date.now() + (validSeconds - 300) * 1000; // refresh 5 min early

  return directorToken!;
}

/**
 * Call the Director REST API.
 */
async function directorGet(path: string): Promise<any> {
  const token = await getDirectorToken();
  const url = `https://${config.control4DirectorIp}/api/v1${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-ignore - Node 22 supports this
    dispatcher: undefined,
  });
  if (!res.ok) throw new Error(`C4 API ${path}: ${res.status}`);
  return res.json();
}

async function directorPost(path: string, body: any): Promise<any> {
  const token = await getDirectorToken();
  const url = `https://${config.control4DirectorIp}/api/v1${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`C4 API ${path}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ============================================
// Public API — used by AI tools
// ============================================

/**
 * List all rooms.
 */
export async function listRooms(): Promise<string> {
  if (!config.control4DirectorIp) return "Control4 לא מוגדר.";
  try {
    const items = await directorGet("/items") as any[];
    const rooms = items.filter((i: any) => i.type === 8);
    return rooms.map((r: any) => `- ${r.name} (ID:${r.id})`).join("\n");
  } catch (e: any) {
    return `שגיאה בחיבור ל-Control4: ${e.message}`;
  }
}

/**
 * List devices in a room or all controllable devices.
 */
export async function listDevices(roomName?: string): Promise<string> {
  if (!config.control4DirectorIp) return "Control4 לא מוגדר.";
  try {
    const items = await directorGet("/items") as any[];
    const rooms = items.filter((i: any) => i.type === 8);
    const connections = items.filter((i: any) => i.type === 7);

    // Find controllable devices (connections with commands)
    const controllable: string[] = [];

    for (const conn of connections) {
      const name = conn.name as string;
      // Filter out system/media items
      if (name.includes("OFFLINE") || name.includes("DELETEME") || name === "Digital Media") continue;

      // Check if it's a known controllable type
      const lower = name.toLowerCase();
      const isLight = !lower.includes("tv") && !lower.includes("apple") && !lower.includes("netflix") &&
        !lower.includes("youtube") && !lower.includes("tunein") && !lower.includes("deezer") &&
        !lower.includes("tidal") && !lower.includes("radio") && !lower.includes("channel") &&
        !lower.includes("music") && !lower.includes("movie") && !lower.includes("xbox") &&
        !lower.includes("sonos") && !lower.includes("hot") && !lower.includes("driver") &&
        !lower.includes("remote") && !lower.includes("bridge") && !lower.includes("cloud") &&
        !lower.includes("keypad") && !lower.includes("ea-3") && !lower.includes("camera") &&
        !lower.includes("paradox") && !lower.includes("alarm") && !lower.includes("gateway") &&
        !lower.includes("getway") && !lower.includes("blackwire") && !lower.includes("link") &&
        !lower.includes("yes plus") && !lower.includes("ifttt") && !lower.includes("bond") &&
        !lower.includes("universal gc") && !lower.includes("home connect") && !lower.includes("vacation") &&
        !lower.includes("air saver") && !lower.includes("electric cabinet") && !lower.includes("add music");

      if (isLight) {
        let type = "💡";
        if (lower.includes("blind") || lower.includes("somfy")) type = "🪟";
        else if (lower.includes("fan") || lower.includes("מאוורר")) type = "🌀";
        else if (lower.includes("cool") || lower.includes("hvac")) type = "❄️";
        else if (lower.includes("boiler") || lower.includes("דוד")) type = "🔥";
        else if (lower.includes("lock") || lower.includes("דלת")) type = "🔒";
        else if (lower.includes("towel") || lower.includes("מגבות") || lower.includes("חימום")) type = "🔥";

        controllable.push(`${type} ${name} (ID:${conn.id})`);
      }
    }

    if (roomName) {
      return `מכשירים ב-${roomName}:\n${controllable.join("\n") || "לא נמצאו"}`;
    }
    return `מכשירים נשלטים (${controllable.length}):\n${controllable.join("\n")}`;
  } catch (e: any) {
    return `שגיאה: ${e.message}`;
  }
}

/**
 * Send a command to a device.
 */
export async function sendCommand(deviceId: number, command: string, params?: Record<string, any>): Promise<string> {
  if (!config.control4DirectorIp) return "Control4 לא מוגדר.";
  try {
    const body: any = {
      async: false,
      command,
      tParams: params || {},
    };
    await directorPost(`/items/${deviceId}/commands`, body);
    return `✅ פקודה ${command} נשלחה למכשיר ${deviceId}`;
  } catch (e: any) {
    return `שגיאה בשליחת פקודה: ${e.message}`;
  }
}

/**
 * Get device status (light level, blind position, etc.)
 */
export async function getDeviceStatus(deviceId: number): Promise<string> {
  if (!config.control4DirectorIp) return "Control4 לא מוגדר.";
  try {
    const vars = await directorGet(`/items/${deviceId}/variables`) as any[];
    if (!vars || vars.length === 0) return `אין מידע על מכשיר ${deviceId}`;

    const lines: string[] = [];
    for (const v of vars) {
      const val = v.value;
      const name = v.varName || v.name || "";
      if (typeof val === "number" || typeof val === "boolean" || typeof val === "string") {
        lines.push(`${name}: ${val}`);
      }
    }
    return lines.join("\n") || `מכשיר ${deviceId}: אין משתנים קריאים`;
  } catch (e: any) {
    return `שגיאה: ${e.message}`;
  }
}

/**
 * Find a device by name (fuzzy match).
 */
export async function findDevice(query: string): Promise<{ id: number; name: string } | null> {
  try {
    const items = await directorGet("/items") as any[];
    const connections = items.filter((i: any) => i.type === 7);
    const lower = query.toLowerCase();

    // Exact match first
    for (const c of connections) {
      if (c.name.toLowerCase() === lower) return { id: c.id, name: c.name };
    }
    // Partial match
    for (const c of connections) {
      if (c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) {
        return { id: c.id, name: c.name };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * High-level: control a device by name.
 * Supports: on/off/toggle for lights, open/close for blinds, temperature for AC.
 */
export async function controlDevice(deviceName: string, action: string, value?: number): Promise<string> {
  if (!config.control4DirectorIp) return "Control4 לא מוגדר.";

  const device = await findDevice(deviceName);
  if (!device) return `❌ לא מצאתי מכשיר בשם "${deviceName}"`;

  const actionLower = action.toLowerCase();
  let command = "";
  let params: Record<string, any> = {};

  if (["on", "הדלק", "הפעל", "דלוק"].includes(actionLower)) {
    command = "ON";
  } else if (["off", "כבה", "כבוי", "סגור"].includes(actionLower)) {
    command = "OFF";
  } else if (["toggle", "החלף"].includes(actionLower)) {
    command = "TOGGLE";
  } else if (["open", "פתח", "הרם", "עלה"].includes(actionLower)) {
    command = "SET_LEVEL_TARGET:LEVEL_TARGET_OPEN";
  } else if (["close", "סגור", "הורד", "ירד"].includes(actionLower)) {
    command = "SET_LEVEL_TARGET:LEVEL_TARGET_CLOSED";
  } else if (["stop", "עצור"].includes(actionLower)) {
    command = "STOP";
  } else if (value !== undefined && ["set", "קבע", "temperature", "טמפרטורה"].includes(actionLower)) {
    command = "SET_SETPOINT_SINGLE";
    params = { CELSIUS: value };
  } else {
    // Try sending as raw command
    command = action.toUpperCase();
  }

  const result = await sendCommand(device.id, command, Object.keys(params).length > 0 ? params : undefined);
  return `${result} (${device.name})`;
}
