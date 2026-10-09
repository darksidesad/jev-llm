import assert from "node:assert/strict";
import { test } from "node:test";
import { createJevDecider, extractExpression, extractOrderId } from "./decider";

process.env.OPENROUTER_KEY = "test-key";

test("extractOrderId finds an order id in any case and rejects other shapes", () => {
  assert.equal(extractOrderId("Where is my order A1001?"), "A1001");
  assert.equal(extractOrderId("track order a1002 please"), "A1002");
  assert.equal(extractOrderId("order A12345 is not an id"), undefined);
  assert.equal(extractOrderId("What's happening with my order?"), undefined);
});

test("extractExpression returns the first arithmetic run with an operator", () => {
  assert.equal(extractExpression("What is 12 * (3 + 4)?"), "12 * (3 + 4)");
  assert.equal(extractExpression("Calculate 250 / 8"), "250 / 8");
  assert.equal(extractExpression("What is 2 + 2 * 10 - 4?"), "2 + 2 * 10 - 4");
});

test("extractExpression gives up instead of guessing from number words or bare numbers", () => {
  assert.equal(extractExpression("What is 15 minus 7 times 2?"), undefined);
  assert.equal(extractExpression("Multiply 19.5 by 3"), undefined);
});

// Replays canned Jev answers in call order and records each request body.
function mockJev(answers: Array<Record<string, unknown>>) {
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const answer = answers.shift();
    return new Response(JSON.stringify({ model: "typesafe/jev-1.13", answers: { choice: answer }, usage: {} }), {
      status: 200,
    });
  }) as typeof fetch;
  return bodies;
}

test("weather question: Jev picks the tool, then the city; argSource marks Jev", async () => {
  const bodies = mockJev([
    { type: "choice", choice: "get_weather", probabilities: { get_weather: 0.9, none: 0.1 } },
    { type: "choice", choice: "Madrid", probabilities: { Madrid: 0.95, none: 0.05 } },
  ]);
  const decision = await createJevDecider().decide("What is the weather in Madrid right now?");
  assert.equal(decision.tool, "get_weather");
  assert.deepEqual(decision.args, { city: "Madrid" });
  assert.deepEqual(decision.argSource, { city: "jev" });
  assert.deepEqual(decision.probabilities, { get_weather: 0.9, none: 0.1 });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].model, "~typesafe/jev-latest");
  assert.deepEqual(bodies[0].state, { question: "What is the weather in Madrid right now?" });
});

test("order question: order id comes from code, Jev is called once", async () => {
  const bodies = mockJev([{ type: "choice", choice: "get_order", probabilities: { get_order: 1 } }]);
  const decision = await createJevDecider("typesafe/jev-1.13").decide("Where is my order A1001?");
  assert.equal(decision.tool, "get_order");
  assert.deepEqual(decision.args, { orderId: "A1001" });
  assert.deepEqual(decision.argSource, { orderId: "code" });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].model, "typesafe/jev-1.13");
});

test("no tool chosen: tool is null and no arguments are sent", async () => {
  mockJev([{ type: "choice", choice: "none", probabilities: { none: 1 } }]);
  const decision = await createJevDecider().decide("Tell me a joke");
  assert.equal(decision.tool, null);
  assert.deepEqual(decision.args, {});
});

test("a choice outside the offered options is an error, not a tool call", async () => {
  mockJev([{ type: "choice", choice: "constructor", probabilities: {} }]);
  await assert.rejects(createJevDecider().decide("anything"), /not an option/);
});
