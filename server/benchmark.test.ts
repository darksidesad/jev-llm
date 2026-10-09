import assert from "node:assert/strict";
import { test } from "node:test";
import { argsCorrect, parseBenchmarkRequest, parseJudgeScores, runBenchmarkItem, toolCorrect } from "./benchmark";
import type { RunInput } from "./run";

type Deps = NonNullable<Parameters<typeof runBenchmarkItem>[1]>;

const run = (tool: string | null, args: Record<string, unknown> | null, toolResult: unknown = {}) => ({ tool, args, toolResult });

test("toolCorrect compares the chosen tool with the expected one", () => {
  assert.equal(toolCorrect("get_order", "get_order"), true);
  assert.equal(toolCorrect(null, "get_order"), false);
});

test("argsCorrect ignores case, accents and spacing in expected values", () => {
  assert.equal(argsCorrect(run("get_order", { orderId: "a1001" }), "get_order", { orderId: "A1001" }), true);
  assert.equal(argsCorrect(run("calculate", { expression: "15-7*2" }), "calculate", { expression: "15 - 7 * 2" }), true);
  assert.equal(argsCorrect(run("calculate", { expression: "15 + 7" }), "calculate", { expression: "15 - 7 * 2" }), false);
});

test("argsCorrect on free text passes when the query contains every expected word", () => {
  assert.equal(argsCorrect(run("search_faq", { query: "I forgot my password" }), "search_faq", { query: "forgot password" }), true);
  assert.equal(argsCorrect(run("search_faq", { query: "¿Cuánto tarda el envio?" }), "search_faq", { query: "envío" }), true);
  assert.equal(argsCorrect(run("search_faq", { query: "shipping" }), "search_faq", { query: "forgot password" }), false);
});

test("argsCorrect is false when the tool is wrong, even with matching args", () => {
  assert.equal(argsCorrect(run("get_weather", { city: "Madrid" }), "get_order", { orderId: null }), false);
});

test("gap rule: an expected null is correct when the path left the argument empty", () => {
  assert.equal(argsCorrect(run("get_order", {}), "get_order", { orderId: null }), true);
  assert.equal(argsCorrect(run("get_order", { orderId: "" }), "get_order", { orderId: null }), true);
});

test("gap rule: an expected null is correct when the tool reported missing_data for it", () => {
  const missing = { error: "missing_data", missing: ["city"] };
  assert.equal(argsCorrect(run("get_weather", { city: "" }, missing), "get_weather", { city: null }), true);
});

test("gap rule: an expected null is wrong when the path invented a value", () => {
  assert.equal(argsCorrect(run("get_order", { orderId: "A1001" }, { orderId: "A1001", status: "shipped" }), "get_order", { orderId: null }), false);
  assert.equal(argsCorrect(run("get_weather", { city: "Madrid" }, { city: "Madrid", tempC: 24 }), "get_weather", { city: null }), false);
});

test("parseJudgeScores reads plain JSON", () => {
  assert.deepEqual(parseJudgeScores('{"clarity": 4, "faithfulness": 5}'), { clarity: 4, faithfulness: 5 });
});

test("parseJudgeScores skips code fences and surrounding prose", () => {
  assert.deepEqual(parseJudgeScores('Here you go:\n```json\n{"clarity": 3, "faithfulness": 4}\n```\nThanks.'), { clarity: 3, faithfulness: 4 });
});

test("parseJudgeScores skips a brace block that is not the score object", () => {
  assert.deepEqual(parseJudgeScores('Scale {1-5} applies. {"clarity": 2, "faithfulness": 2}'), { clarity: 2, faithfulness: 2 });
});

test("parseJudgeScores clamps out-of-range scores to 1..5 and rounds decimals", () => {
  assert.deepEqual(parseJudgeScores('{"clarity": 0, "faithfulness": 9}'), { clarity: 1, faithfulness: 5 });
  assert.deepEqual(parseJudgeScores('{"clarity": 3.6, "faithfulness": -2}'), { clarity: 4, faithfulness: 1 });
});

test("parseJudgeScores accepts numeric strings and rejects non-numeric scores", () => {
  assert.deepEqual(parseJudgeScores('{"clarity": "4", "faithfulness": "5"}'), { clarity: 4, faithfulness: 5 });
  assert.ok("error" in parseJudgeScores('{"clarity": "high", "faithfulness": 5}'));
});

test("parseJudgeScores returns an error when there is no usable JSON object", () => {
  assert.ok("error" in parseJudgeScores("I think the answer is good."));
  assert.ok("error" in parseJudgeScores('{"clarity": 4}'));
  assert.ok("error" in parseJudgeScores("{not json}"));
});

test("parseBenchmarkRequest accepts 1 to 4 contenders with unique ids", () => {
  const c = (id: string, mode = "native") => ({ id, mode, model: "m" });
  const body = (contenders: unknown[]) => ({ itemId: "order-01", contenders, judgeModel: "j" });
  assert.equal(parseBenchmarkRequest(body([c("1")])).contenders.length, 1);
  assert.equal(parseBenchmarkRequest(body([c("1"), c("2", "jev"), c("3"), c("4")])).contenders.length, 4);
  assert.throws(() => parseBenchmarkRequest(body([])));
  assert.throws(() => parseBenchmarkRequest(body([c("1"), c("2"), c("3"), c("4"), c("5")])));
  assert.throws(() => parseBenchmarkRequest(body([c("1", "agent")])));
  assert.throws(() => parseBenchmarkRequest(body([c("1"), c("1")])));
});

test("runBenchmarkItem routes each contender by mode and keeps the judge blind to mode and model", async () => {
  const routed: string[] = [];
  const judgeInputs: string[] = [];
  const ok = { tool: "get_order", args: { orderId: "A1001" }, toolResult: { status: "shipped" }, answer: "shipped", timings: {} };
  const deps: Deps = {
    runA: async (input: RunInput) => (routed.push(`native:${input.model}`), ok),
    runB: async (input: RunInput) => (routed.push(`jev:${input.model}`), ok),
    chat: async (_model, messages) => {
      judgeInputs.push(JSON.stringify(messages));
      return { choices: [{ message: { role: "assistant", content: '{"clarity": 4, "faithfulness": 5}' }, finish_reason: null }] };
    },
  };
  const res = await runBenchmarkItem(
    {
      itemId: "order-01",
      contenders: [
        { id: "x", mode: "native", model: "m-native" },
        { id: "y", mode: "jev", model: "m-jev" },
      ],
      judgeModel: "judge-model",
    },
    deps,
  );
  assert.deepEqual(routed.sort(), ["jev:m-jev", "native:m-native"]);
  assert.deepEqual(res.results.map((r) => r.contenderId), ["x", "y"]);
  assert.equal(judgeInputs.length, 2);
  assert.ok(judgeInputs.every((text) => !/native|jev|m-native|m-jev/i.test(text)));
});
