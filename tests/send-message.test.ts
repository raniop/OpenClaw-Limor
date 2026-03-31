/**
 * Tests for src/ai/send-message.ts
 *
 * Strategy: We test the tool loop and hallucination guard by directly
 * importing and testing the sendMessage function with mocked dependencies.
 * Since the module imports `client` from "./client", we mock it by
 * replacing `client.messages.stream` before each test.
 */
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { client } from "../src/ai/client";
import { allHandlers } from "../src/ai/handlers";
import type { SenderContext } from "../src/ai/types";
import type { Message } from "../src/ai/types";

// We import sendMessage AFTER setting up the mock state
import { sendMessage } from "../src/ai/send-message";

const owner: SenderContext = { chatId: "owner@c.us", name: "רני", isOwner: true };

// Helper: create a fake Anthropic Message response
function makeTextResponse(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function makeToolUseResponse(toolName: string, toolId: string, input: any) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [
      { type: "tool_use", id: toolId, name: toolName, input },
    ],
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function makeMultiToolResponse(tools: Array<{ name: string; id: string; input: any }>) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: tools.map((t) => ({
      type: "tool_use", id: t.id, name: t.name, input: t.input,
    })),
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

// Helper: wrap a response in a fake stream object (matching client.messages.stream() API)
function fakeStream(response: any) {
  return { finalMessage: () => Promise.resolve(response) };
}

// Saved original
const originalStream = client.messages.stream.bind(client.messages);

describe("sendMessage", () => {
  beforeEach(() => {
    // Restore any mocked handlers
    (client.messages as any).stream = originalStream;
  });

  it("returns text for simple response (no tools)", async () => {
    let callCount = 0;
    (client.messages as any).stream = () => {
      callCount++;
      return fakeStream(makeTextResponse("שלום! מה שלומך?"));
    };

    const result = await sendMessage(
      [{ role: "user", content: "היי" }],
      undefined,
      owner,
      { allowTools: false }
    );

    assert.strictEqual(result.text, "שלום! מה שלומך?");
    assert.strictEqual(callCount, 1);
  });

  it("handles single tool call → tool result → final text", async () => {
    let callCount = 0;
    (client.messages as any).stream = () => {
      callCount++;
      if (callCount === 1) {
        return fakeStream(makeToolUseResponse("list_files", "toolu_1", { directory: "/" }));
      }
      // After tool result, return final text
      return fakeStream(makeTextResponse("הנה הקבצים שמצאתי."));
    };

    // Mock the handler
    const origHandler = allHandlers["list_files"];
    allHandlers["list_files"] = async () => "file1.txt\nfile2.txt";

    try {
      const result = await sendMessage(
        [{ role: "user", content: "הראה לי קבצים" }],
        undefined,
        owner,
      );
      assert.strictEqual(result.text, "הנה הקבצים שמצאתי.");
      assert.strictEqual(callCount, 2); // initial + after tool result
    } finally {
      allHandlers["list_files"] = origHandler;
    }
  });

  it("handles multiple parallel tool calls", async () => {
    let callCount = 0;
    const toolCallOrder: string[] = [];

    (client.messages as any).stream = () => {
      callCount++;
      if (callCount === 1) {
        return fakeStream(makeMultiToolResponse([
          { name: "list_files", id: "toolu_1", input: { directory: "/" } },
          { name: "list_instructions", id: "toolu_2", input: {} },
        ]));
      }
      return fakeStream(makeTextResponse("הנה תוצאות שני הכלים."));
    };

    const origFiles = allHandlers["list_files"];
    const origInstructions = allHandlers["list_instructions"];
    allHandlers["list_files"] = async () => { toolCallOrder.push("files"); return "file1.txt"; };
    allHandlers["list_instructions"] = async () => { toolCallOrder.push("instructions"); return "inst1"; };

    try {
      const result = await sendMessage(
        [{ role: "user", content: "הראה קבצים והוראות" }],
        undefined,
        owner,
      );
      assert.strictEqual(result.text, "הנה תוצאות שני הכלים.");
      // Both tools should have been called (Promise.all)
      assert.ok(toolCallOrder.includes("files"));
      assert.ok(toolCallOrder.includes("instructions"));
      assert.strictEqual(callCount, 2);
    } finally {
      allHandlers["list_files"] = origFiles;
      allHandlers["list_instructions"] = origInstructions;
    }
  });

  it("breaks tool loop at MAX_TOOL_ITERATIONS", async () => {
    let callCount = 0;
    (client.messages as any).stream = () => {
      callCount++;
      // Always return tool_use — should hit the max iterations limit
      return fakeStream(makeToolUseResponse("list_files", `toolu_${callCount}`, { directory: "/" }));
    };

    const origHandler = allHandlers["list_files"];
    allHandlers["list_files"] = async () => "ok";

    try {
      const result = await sendMessage(
        [{ role: "user", content: "loop forever" }],
        undefined,
        owner,
      );
      // Should not loop forever — should break and return something
      // The initial call + 15 iterations = 16 calls to create
      assert.ok(callCount <= 17, `Expected ≤17 API calls, got ${callCount}`);
      // Result should be from the last tool_use response — no text block → fallback
      assert.ok(typeof result.text === "string");
    } finally {
      allHandlers["list_files"] = origHandler;
    }
  });

  it("hallucination guard triggers retry on claimed action without tool use", async () => {
    let streamCount = 0;
    let createCount = 0;
    // Initial call goes through stream()
    (client.messages as any).stream = () => {
      streamCount++;
      return fakeStream(makeTextResponse("שלחתי הודעה ליוסי בהצלחה!"));
    };
    // Hallucination retry goes through create() in guards.ts
    (client.messages as any).create = async () => {
      createCount++;
      return makeTextResponse("אין לי אפשרות לשלוח הודעות ישירות.");
    };

    const result = await sendMessage(
      [{ role: "user", content: "שלח הודעה ליוסי" }],
      undefined,
      owner,
    );

    // Should have retried and returned the honest response
    assert.strictEqual(result.text, "אין לי אפשרות לשלוח הודעות ישירות.");
    assert.strictEqual(streamCount, 1, "Initial call via stream");
    assert.ok(createCount >= 1, "Retry call via create");
  });

  it("hallucination guard retry also fails — returns retry text", async () => {
    let streamCount = 0;
    let createCount = 0;
    (client.messages as any).stream = () => {
      streamCount++;
      return fakeStream(makeTextResponse("קבעתי פגישה ביומן!"));
    };
    (client.messages as any).create = async () => {
      createCount++;
      return makeTextResponse("הפגישה נקבעה כמבוקש.");
    };

    const result = await sendMessage(
      [{ role: "user", content: "קבע פגישה" }],
      undefined,
      owner,
    );

    // retryOnHallucination returns the retry text even if still hallucinating
    assert.strictEqual(result.text, "הפגישה נקבעה כמבוקש.");
  });

  it("returns fallback text when response has no text block", async () => {
    (client.messages as any).stream = () => fakeStream({
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [], // empty content
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await sendMessage(
      [{ role: "user", content: "test" }],
      undefined,
      owner,
      { allowTools: false }
    );

    assert.ok(result.text.includes("אופס"));
  });

  it("empty tool blocks cause loop to break", async () => {
    let callCount = 0;
    (client.messages as any).stream = () => {
      callCount++;
      // stop_reason is tool_use but no tool blocks
      return fakeStream({
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        model: "claude-sonnet-4-6",
        stop_reason: "tool_use", // says tool_use but content has no tool blocks
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    };

    const result = await sendMessage(
      [{ role: "user", content: "test" }],
      undefined,
      owner,
    );

    assert.strictEqual(result.text, "done");
    assert.strictEqual(callCount, 1); // no additional calls
  });
});
