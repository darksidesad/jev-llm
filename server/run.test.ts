import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatCompletion, ChatMessage } from "./openrouter";
import { parseRunInput, RunError, runPathA, runPathB } from "./run";
import type { Decider } from "./decider";
import { runTool, type ToolDef } from "./tools";

const input = { model: "m/x", question: "Where is my order A1001?", deciderModel: "~typesafe/jev-latest" };

function completion(message: Record<string, unknown>): ChatCompletion {
  return { choices: [{ message: { role: "assistant", ...message } as ChatMessage, finish_reason: null }] };
}

test("parseRunInput trims values and defaults the decider model", () => {
  assert.deepEqual(parseRunInput({ model: " m ", question: " q " }), {
    model: "m",
    question: "q",
    deciderModel: "~typesafe/jev-latest",
  });
});

test("parseRunInput rejects bodies without model or question with status 400", () => {
  for (const body of [null, {}, { model: "m" }, { model: "m", question: "  " }]) {
    assert.throws(() => parseRunInput(body), (err: RunError) => err.status === 400);
  }
});

test("path A without a tool call answers directly with tool null", async () => {
  const calls: unknown[][] = [];
  const res = await runPathA(input, {
    chat: async (...args) => {
      calls.push(args);
      return completion({ content: "Hello" });
    },
    runTool,
  });
  assert.equal(calls.length, 1);
  assert.equal(res.tool, null);
  assert.equal(res.answer, "Hello");
  assert.equal(typeof res.timings.decisionMs, "number");
  assert.equal(res.timings.llmMs, undefined);
});

test("path A runs the model's tool call and asks for the final answer without tools", async () => {
  const seen: { messages: ChatMessage[]; tools?: ToolDef[] }[] = [];
  const res = await runPathA(input, {
    chat: async (_model, messages, tools) => {
      seen.push({ messages: [...messages], tools });
      if (seen.length === 1) {
        return completion({
          content: null,
          tool_calls: [{ id: "c1", type: "function", function: { name: "get_order", arguments: '{"orderId":"A1001"}' } }],
        });
      }
      return completion({ content: "Your order has shipped." });
    },
    runTool,
  });
  assert.equal(res.tool, "get_order");
  assert.deepEqual(res.args, { orderId: "A1001" });
  assert.equal(res.toolResult && (res.toolResult as { status?: string }).status, "shipped");
  assert.equal(res.answer, "Your order has shipped.");
  assert.ok(seen[0].tools?.length, "first call carries tool definitions");
  assert.equal(seen[1].tools, undefined);
  const toolMessage = seen[1].messages.at(-1);
  assert.equal(toolMessage?.role, "tool");
  assert.equal(toolMessage?.tool_call_id, "c1");
  assert.equal(res.timings.toolMs !== undefined && res.timings.llmMs !== undefined, true);
});

test("path A failures carry the upstream message verbatim and timings so far", async () => {
  await assert.rejects(
    runPathA(input, {
      chat: async () => {
        throw new Error("OpenRouter 429: rate limited");
      },
      runTool,
    }),
    (err: RunError) => err.message === "OpenRouter 429: rate limited" && err.status === 502 && typeof err.timings.totalMs === "number",
  );
});

test("path B runs the decided tool and answers from its result only", async () => {
  const decider: Decider = {
    decide: async () => ({
      tool: "get_order",
      args: { orderId: "A1001" },
      argSource: { orderId: "code" },
      probabilities: { get_order: 0.98, none: 0.02 },
    }),
  };
  let messages: ChatMessage[] = [];
  const res = await runPathB(input, {
    decider,
    chat: async (_model, msgs) => {
      messages = msgs;
      return completion({ content: "Shipped, arriving 2026-10-11." });
    },
    runTool,
  });
  assert.equal(res.tool, "get_order");
  assert.deepEqual(res.argSource, { orderId: "code" });
  assert.deepEqual(res.probabilities, { get_order: 0.98, none: 0.02 });
  assert.equal(res.answer, "Shipped, arriving 2026-10-11.");
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content ?? "", /- orderId: A1001/);
  assert.equal(typeof res.timings.decisionMs, "number");
});

test("path B with no tool sends a null tool result to the answering model", async () => {
  const decider: Decider = { decide: async () => ({ tool: null, args: {}, argSource: {}, probabilities: { none: 1 } }) };
  let userMessage = "";
  const res = await runPathB(input, {
    decider,
    chat: async (_model, msgs) => {
      userMessage = msgs[1].content ?? "";
      return completion({ content: "I cannot help with that." });
    },
    runTool,
  });
  assert.equal(res.toolResult, null);
  assert.match(userMessage, /Tool used: none/);
  assert.equal(res.answer, "I cannot help with that.");
});

test("path B decider failures carry the upstream message verbatim", async () => {
  const decider: Decider = {
    decide: async () => {
      throw new Error("OpenRouter 402: no credits");
    },
  };
  await assert.rejects(
    runPathB(input, { decider, chat: async () => completion({ content: "" }), runTool }),
    (err: RunError) => err.message === "OpenRouter 402: no credits" && err.timings.decisionMs === undefined,
  );
});
