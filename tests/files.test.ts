import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { resolve } from "path";

const FILES_DIR = resolve(__dirname, "..", "files");
if (!existsSync(FILES_DIR)) mkdirSync(FILES_DIR, { recursive: true });

function resetFiles() {
  // Clean up test files but keep directory
  const testFile = resolve(FILES_DIR, "test.txt");
  try { rmSync(testFile); } catch {}
  const testDir = resolve(FILES_DIR, "subdir");
  try { rmSync(testDir, { recursive: true }); } catch {}
}

import { listFiles, readFile, saveFile } from "../src/files";

describe("files", () => {
  beforeEach(() => resetFiles());

  describe("saveFile + readFile", () => {
    it("saves and reads a text file", () => {
      const result = saveFile("test.txt", "hello world");
      assert.ok(result.includes("נשמר"));
      const content = readFile("test.txt");
      assert.strictEqual(content, "hello world");
    });

    it("creates parent directories", () => {
      const result = saveFile("subdir/nested.txt", "nested content");
      assert.ok(result.includes("נשמר"));
      const content = readFile("subdir/nested.txt");
      assert.strictEqual(content, "nested content");
    });
  });

  describe("safePath", () => {
    it("rejects path traversal", () => {
      assert.throws(() => readFile("../../.env"), /נדחתה/);
    });

    it("rejects absolute paths", () => {
      assert.throws(() => readFile("/etc/passwd"), /נדחתה/);
    });
  });

  describe("readFile", () => {
    it("returns error for missing file", () => {
      const result = readFile("nonexistent.txt");
      assert.ok(result.includes("לא נמצא"));
    });
  });

  describe("listFiles", () => {
    it("lists files in directory", () => {
      saveFile("test.txt", "content");
      const result = listFiles();
      assert.ok(result.includes("test.txt"));
    });
  });
});
