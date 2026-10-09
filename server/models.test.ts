import assert from "node:assert/strict";
import { test } from "node:test";
import { toModelInfo } from "./models";

const base = { name: "M", context_length: 8000 };

test("tools flag comes from supported_parameters", () => {
  const withTools = toModelInfo({ ...base, id: "a/b", pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: ["tools", "temperature"] });
  const without = toModelInfo({ ...base, id: "a/c", pricing: { prompt: "0.000001", completion: "0.000002" } });
  assert.equal(withTools.tools, true);
  assert.equal(without.tools, false);
});

test("free when id ends with :free or both prices are zero", () => {
  assert.equal(toModelInfo({ ...base, id: "x/y:free", pricing: { prompt: "0.000001", completion: "0.000001" } }).free, true);
  assert.equal(toModelInfo({ ...base, id: "x/z", pricing: { prompt: "0", completion: "0" } }).free, true);
  assert.equal(toModelInfo({ ...base, id: "x/w", pricing: { prompt: "0", completion: "0.000001" } }).free, false);
});

test("prices are converted to USD per 1M tokens", () => {
  const m = toModelInfo({ ...base, id: "x/p", pricing: { prompt: "0.00000015", completion: "0.0000006" } });
  assert.equal(m.promptPrice, 0.15);
  assert.equal(m.completionPrice, 0.6);
  assert.equal(m.contextLength, 8000);
});

test("negative prices (variable-cost routers) are never free", () => {
  const router = toModelInfo({ ...base, id: "openrouter/fusion", pricing: { prompt: "-1", completion: "-1" } });
  assert.equal(router.free, false);
  assert.equal(router.promptPrice, -1000000);
});
