/**
 * Nimrod — persistent state management (evidence retention)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { NimrodState, NimrodAlert } from "./types";

const STATE_DIR = resolve(__dirname, "../../../workspace/state");
const STATE_PATH = resolve(STATE_DIR, "nimrod-state.json");
const MAX_ALERTS = 200;
const MAX_ALERTS_PER_HOUR = 3;

function defaultState(): NimrodState {
  return {
    lastFullScan: null,
    alertsThisHour: 0,
    alertsHourStart: null,
    alerts: [],
  };
}

export function loadState(): NimrodState {
  try {
    if (!existsSync(STATE_PATH)) return defaultState();
    return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return defaultState();
  }
}

export function saveState(state: NimrodState): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

/** Returns true if alert can be sent (throttle: max 3/hour) */
export function canSendAlert(state: NimrodState): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  if (!state.alertsHourStart || now - new Date(state.alertsHourStart).getTime() > hourMs) {
    state.alertsThisHour = 0;
    state.alertsHourStart = new Date().toISOString();
  }

  return state.alertsThisHour < MAX_ALERTS_PER_HOUR;
}

export function recordAlert(state: NimrodState, alert: NimrodAlert): void {
  state.alerts.unshift(alert);
  if (state.alerts.length > MAX_ALERTS) state.alerts = state.alerts.slice(0, MAX_ALERTS);
  state.alertsThisHour = (state.alertsThisHour || 0) + 1;
  if (!state.alertsHourStart) state.alertsHourStart = new Date().toISOString();
}
