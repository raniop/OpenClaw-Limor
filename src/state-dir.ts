/**
 * Central state directory resolver.
 * Tests set LIMOR_STATE_DIR env var to redirect all state I/O to a temp directory.
 * The env var is checked on every call (not cached) so tests can set it after import.
 */
import { resolve } from "path";

const DEFAULT_STATE_DIR = resolve(__dirname, "..", "workspace", "state");

export function getStateDir(): string {
  return process.env.LIMOR_STATE_DIR || DEFAULT_STATE_DIR;
}

export function statePath(filename: string): string {
  return resolve(getStateDir(), filename);
}
