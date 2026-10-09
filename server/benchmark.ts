import { chat, type ChatCompletion } from "./openrouter";
import { JEV_DEFAULT_MODEL } from "./decider";
import { dataset, type BenchItem } from "./dataset";
import { RunError, runPathA, runPathB, type RunInput, type Timings } from "./run";

// The fields both paths share; each path's full result is a superset.
type PathRun = { tool: string | null; args: Record<string, unknown> | null; toolResult: unknown; answer: string; timings: Timings };
export type JudgeScores = { clarity: number; faithfulness: number };
export type JudgeResult = JudgeScores | { error: string };
export type PathBenchmark =
  | { result: PathRun; toolCorrect: boolean; argsCorrect: boolean; judge: JudgeResult }
  | { error: string; toolCorrect: false; argsCorrect: false };
// native = path A (model calls tools itself), jev = path B (Jev picks the tool, the model only answers).
export type Mode = "native" | "jev";
export type Contender = { id: string; mode: Mode; model: string };
export const MAX_CONTENDERS = 4;
export type BenchmarkRequest = { itemId: string; contenders: Contender[]; judgeModel: string };

type Deps = {
  runA: (input: RunInput) => Promise<PathRun>;
  runB: (input: RunInput) => Promise<PathRun>;
  chat: typeof chat;
};
const realDeps: Deps = { runA: runPathA, runB: runPathB, chat };

// Free-text arguments (a search query) pass when they contain every expected word; others must match exactly.
const FREE_TEXT_ARGS = new Set(["query"]);

// Lowercase and drop accents, so "envío" matches "envio".
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function toolCorrect(chosen: string | null, expectedTool: string): boolean {
  return chosen === expectedTool;
}

// Gap rule: an expected null means the user never gave that value. Such an argument is correct when the
// path left it empty or the tool reported missing_data for it, i.e. the path did not invent a value.
// Args are judged only when the tool itself is right.
export function argsCorrect(
  run: { tool: string | null; args: Record<string, unknown> | null; toolResult: unknown },
  expectedTool: string,
  expected: Record<string, string | null>,
): boolean {
  if (!toolCorrect(run.tool, expectedTool)) return false;
  const args = run.args ?? {};
  const missing = missingFieldsOf(run.toolResult);
  return Object.entries(expected).every(([key, want]) => {
    const got = args[key];
    if (want === null) return (got === undefined || got === null || plain(String(got)) === "") || missing.includes(key);
    return typeof got === "string" && argMatches(key, got, want);
  });
}

function missingFieldsOf(toolResult: unknown): string[] {
  const value = toolResult as { error?: unknown; missing?: unknown } | null;
  return value?.error === "missing_data" && Array.isArray(value.missing) ? value.missing.map(String) : [];
}

function argMatches(key: string, got: string, want: string): boolean {
  if (FREE_TEXT_ARGS.has(key)) {
    const words = new Set(plain(got).match(/[\p{L}\p{N}]+/gu) ?? []);
    return (plain(want).match(/[\p{L}\p{N}]+/gu) ?? []).every((w) => words.has(w));
  }
  // Whitespace-insensitive, so "15-7*2" matches "15 - 7 * 2".
  return plain(got).replace(/\s+/g, "") === plain(want).replace(/\s+/g, "");
}

const score = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : undefined;
};

// Takes the first flat {...} block that holds both scores, so code fences and prose around it are ignored.
// Scores are rounded and clamped to 1..5; blocks without two numeric scores are skipped.
export function parseJudgeScores(raw: string): JudgeScores | { error: string } {
  for (const [block] of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      const value = JSON.parse(block) as Record<string, unknown>;
      const clarity = score(value.clarity);
      const faithfulness = score(value.faithfulness);
      if (clarity !== undefined && faithfulness !== undefined) return { clarity, faithfulness };
    } catch {
      // not JSON; try the next block
    }
  }
  return { error: `judge reply has no {"clarity", "faithfulness"} JSON: ${raw.slice(0, 200)}` };
}

const JUDGE_SYSTEM = [
  "You grade one answer from a customer-support assistant.",
  'Reply with ONLY a JSON object {"clarity": n, "faithfulness": n}, each n an integer from 1 to 5.',
  "clarity: how easy the answer is for a non-expert to understand.",
  "faithfulness: how well the answer states only what the tool result supports (5 = nothing beyond it, 1 = invented facts).",
].join(" ");

async function judgeAnswer(
  model: string,
  question: string,
  toolResult: unknown,
  answer: string,
  chatFn: Deps["chat"],
): Promise<JudgeResult> {
  try {
    const res: ChatCompletion = await chatFn(model, [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: `Question: ${question}\nTool result JSON: ${JSON.stringify(toolResult)}\nAnswer: ${answer}` },
    ]);
    return parseJudgeScores(res.choices[0]?.message?.content ?? "");
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function evaluatePath(item: BenchItem, run: Promise<PathRun>, judgeModel: string, deps: Deps): Promise<PathBenchmark> {
  try {
    const result = await run;
    return {
      result,
      toolCorrect: toolCorrect(result.tool, item.expectedTool),
      argsCorrect: argsCorrect(result, item.expectedTool, item.expectedArgs),
      judge: await judgeAnswer(judgeModel, item.question, result.toolResult, result.answer, deps.chat),
    };
  } catch (err) {
    return { error: (err as Error).message, toolCorrect: false, argsCorrect: false };
  }
}

function parseContender(value: unknown): Contender {
  const { id, mode, model } = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  if (typeof id !== "string" || !id.trim()) throw new RunError("contender id is required", {}, 400);
  if (mode !== "native" && mode !== "jev") throw new RunError("contender mode must be native or jev", {}, 400);
  if (typeof model !== "string" || !model.trim()) throw new RunError("contender model is required", {}, 400);
  return { id, mode, model: model.trim() };
}

export function parseBenchmarkRequest(body: unknown): BenchmarkRequest {
  if (typeof body !== "object" || body === null) throw new RunError("body must be a JSON object", {}, 400);
  const { itemId, contenders, judgeModel } = body as Record<string, unknown>;
  if (typeof itemId !== "string" || !dataset.some((item) => item.id === itemId)) {
    throw new RunError(`unknown itemId: ${String(itemId)}`, {}, 400);
  }
  if (!Array.isArray(contenders) || contenders.length < 1 || contenders.length > MAX_CONTENDERS) {
    throw new RunError(`contenders must hold 1 to ${MAX_CONTENDERS} entries`, {}, 400);
  }
  if (typeof judgeModel !== "string" || !judgeModel.trim()) throw new RunError("judgeModel is required", {}, 400);
  const parsed = contenders.map(parseContender);
  // Results are matched back to contenders by id, so ids must be unique.
  if (new Set(parsed.map((c) => c.id)).size !== parsed.length) throw new RunError("contender ids must be unique", {}, 400);
  return { itemId, contenders: parsed, judgeModel: judgeModel.trim() };
}

// Runs one benchmark item through every contender in parallel, then judges each run that returned.
export async function runBenchmarkItem(req: BenchmarkRequest, deps: Deps = realDeps) {
  const item = dataset.find((i) => i.id === req.itemId);
  if (!item) throw new RunError(`unknown itemId: ${req.itemId}`, {}, 400);
  const input = (model: string) => ({ model, question: item.question, deciderModel: JEV_DEFAULT_MODEL });
  const results = await Promise.all(
    req.contenders.map(async (c) => ({
      contenderId: c.id,
      ...(await evaluatePath(item, (c.mode === "native" ? deps.runA : deps.runB)(input(c.model)), req.judgeModel, deps)),
    })),
  );
  return { itemId: item.id, question: item.question, expectedTool: item.expectedTool, results };
}
