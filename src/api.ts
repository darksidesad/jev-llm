// Shapes mirror server/models.ts and server/run.ts.
export type ModelInfo = {
  id: string;
  name: string;
  tools: boolean;
  free: boolean;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
};

export type Timings = { decisionMs?: number; toolMs?: number; llmMs?: number; totalMs?: number };

export type RunResult = {
  path: "A" | "B";
  model: string;
  tool: string | null;
  args: Record<string, unknown> | null;
  toolResult: unknown;
  answer: string;
  timings: Timings;
  // Jev mode only.
  deciderModel?: string;
  argSource?: Record<string, "jev" | "code">;
  probabilities?: Record<string, number>;
};

export type RunState =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | { status: "done"; result: RunResult }
  | { status: "error"; message: string; timings: Timings };

// Carries the server's error text and the stage timings reached before the failure.
export class ApiError extends Error {
  timings: Timings;

  constructor(message: string, timings: Timings = {}) {
    super(message);
    this.timings = timings;
  }
}

type ErrorBody = { error?: string; timings?: Timings };

const readJson = (res: Response): Promise<unknown> => res.json().catch(() => null);

function failure(res: Response, body: unknown): ApiError {
  const { error, timings } = (body ?? {}) as ErrorBody;
  return new ApiError(error ?? `HTTP ${res.status}`, timings ?? {});
}

export async function getModels(): Promise<ModelInfo[]> {
  const res = await fetch("/api/models");
  const body = await readJson(res);
  if (!res.ok) throw failure(res, body);
  return body as ModelInfo[];
}

export async function runPath(path: "a" | "b", model: string, question: string): Promise<RunResult> {
  const res = await fetch(`/api/run/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, question }),
  });
  const body = await readJson(res);
  if (!res.ok) throw failure(res, body);
  return body as RunResult;
}

// Shapes mirror server/benchmark.ts.
export type BenchItem = { id: string; question: string; expectedTool: string };

export type Judge = { clarity: number; faithfulness: number } | { error: string };

export type PathBench =
  | { result: RunResult; toolCorrect: boolean; argsCorrect: boolean; judge: Judge }
  | { error: string; toolCorrect: false; argsCorrect: false };

export type BenchItemResponse = {
  itemId: string;
  question: string;
  expectedTool: string;
  results: ContenderBench[];
};

// Mode "native" is path A (the model calls tools itself); "jev" is path B (Jev picks the tool).
export type Mode = "native" | "jev";
export type Contender = { id: string; mode: Mode; model: string };
export type ContenderBench = { contenderId: string } & PathBench;

export async function getBenchmarkItems(): Promise<BenchItem[]> {
  const res = await fetch("/api/benchmark/items");
  const body = await readJson(res);
  if (!res.ok) throw failure(res, body);
  return body as BenchItem[];
}

export async function runBenchmarkItem(
  body: { itemId: string; contenders: Contender[]; judgeModel: string },
  signal: AbortSignal,
): Promise<BenchItemResponse> {
  const res = await fetch("/api/benchmark/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await readJson(res);
  if (!res.ok) throw failure(res, json);
  return json as BenchItemResponse;
}
