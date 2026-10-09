import assert from "node:assert/strict";
import { test } from "node:test";
import { runTool, toolDefs } from "./tools";
import { dataset } from "./dataset";

test("get_order returns the fixed record for a known id", () => {
  assert.deepEqual(runTool("get_order", { orderId: "A1001" }), {
    orderId: "A1001",
    status: "shipped",
    eta: "2026-10-11",
    items: ["wireless mouse"],
  });
});

test("get_order reports unknown ids as not found", () => {
  assert.deepEqual(runTool("get_order", { orderId: "Z9" }), { found: false, orderId: "Z9" });
});

test("get_weather returns the fixed record for a supported city", () => {
  assert.deepEqual(runTool("get_weather", { city: "Madrid" }), { city: "Madrid", tempC: 24, condition: "sunny" });
});

test("get_weather rejects cities outside the closed set", () => {
  assert.equal(runTool("get_weather", { city: "Atlantis" }).error, "missing_data");
});

test("calculate evaluates arithmetic with precedence and parentheses", () => {
  assert.equal(runTool("calculate", { expression: "12 * (3 + 4)" }).result, 84);
  assert.equal(runTool("calculate", { expression: "250 / 8" }).result, 31.25);
  assert.equal(runTool("calculate", { expression: "-3 + 5" }).result, 2);
});

test("calculate rejects unsafe or malformed input without evaluating it", () => {
  assert.equal(runTool("calculate", { expression: "process.exit()" }).error, "missing_data");
  assert.equal(runTool("calculate", { expression: "require('fs')" }).error, "missing_data");
  assert.equal(runTool("calculate", { expression: "1 / 0" }).error, "missing_data");
  assert.equal(runTool("calculate", { expression: "2 +" }).error, "missing_data");
});

test("search_faq returns the best matching entry", () => {
  assert.deepEqual(runTool("search_faq", { query: "return an item" }), {
    found: true,
    question: "How do I return an item?",
    answer: "Returns are accepted within 30 days of delivery with the original receipt.",
  });
  assert.equal(runTool("search_faq", { query: "garantía" }).found, true);
});

test("search_faq reports no match", () => {
  assert.deepEqual(runTool("search_faq", { query: "quantum chromodynamics" }), {
    found: false,
    query: "quantum chromodynamics",
  });
});

test("missing or non-string args return missing_data instead of throwing", () => {
  assert.deepEqual(runTool("get_order", {}), { error: "missing_data", missing: ["orderId"] });
  assert.deepEqual(runTool("calculate", { expression: 42 }), { error: "missing_data", missing: ["expression"] });
  assert.deepEqual(runTool("search_faq", { query: "  " }), { error: "missing_data", missing: ["query"] });
  assert.equal(runTool("get_weather", {}).error, "missing_data");
});

test("every benchmark item names a defined tool", () => {
  const names = new Set(toolDefs.map((d) => d.function.name));
  for (const item of dataset) assert.ok(names.has(item.expectedTool), item.id);
});

test("benchmark args run cleanly unless the item marks a gap", () => {
  for (const item of dataset) {
    const hasGap = Object.values(item.expectedArgs).some((v) => v === null);
    assert.equal(runTool(item.expectedTool, item.expectedArgs).error === "missing_data", hasGap, item.id);
  }
});
