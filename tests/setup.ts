/**
 * Global test setup — redirect state to a temp directory
 * so tests never touch production data.
 *
 * This file MUST be imported before any src/ imports in test files.
 */
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const testStateDir = mkdtempSync(join(tmpdir(), "limor-test-state-"));
process.env.LIMOR_STATE_DIR = testStateDir;
