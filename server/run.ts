import { chat, type ChatMessage } from "./openrouter";
import { createJevDecider, JEV_DEFAULT_MODEL, type Decider } from "./decider";
import { runTool, toolDefs } from "./tools";

export type Timings = { decisionMs?: number; toolMs?: number; llmMs?: number; totalMs?: number };

// Carries the stage timings reached so far, so the route can report them with the error.
export class RunError extends Error {
  timings: Timings;
  status: 400 | 502;

  constructor(message: string, timings: Timings = {}, status: 400 | 502 = 502) {
    super(message);
    this.timings = timings;
    this.status = status;
  }
}

export type RunInput = { model: string; question: string; deciderModel: string };

export function parseRunInput(body: unknown): RunInput {
  if (typeof body !== "object" || body === null) throw new RunError("body must be a JSON object", {}, 400);
  const { model, question, deciderModel } = body as Record<string, unknown>;
  if (typeof model !== "string" || !model.trim()) throw new RunError("model is required", {}, 400);
  if (typeof question !== "string" || !question.trim()) throw new RunError("question is required", {}, 400);
  return {
    model: model.trim(),
    question: question.trim(),
    deciderModel: typeof deciderModel === "string" && deciderModel.trim() ? deciderModel.trim() : JEV_DEFAULT_MODEL,
  };
}

type Deps = { chat: typeof chat; runTool: typeof runTool };
const realDeps: Deps = { chat, runTool };

const SINCE = (start: number) => Math.round(performance.now() - start);

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through to the explicit error below
  }
  throw new Error(`model returned tool arguments that are not a JSON object: ${raw}`);
}

// Path A: the answering model picks the tool and writes its arguments (native tool calling).
export async function runPathA(input: RunInput, deps: Deps = realDeps) {
  const { model, question } = input;
  const timings: Timings = {};
  const start = performance.now();
  try {
    let t = performance.now();
    const first = await deps.chat(model, [{ role: "user", content: question }], toolDefs);
    timings.decisionMs = SINCE(t);
    const msg = first.choices[0]?.message;
    if (!msg) throw new Error("OpenRouter returned no message");

    const call = msg.tool_calls?.[0];
    if (!call) {
      return { path: "A", model, tool: null, args: null, toolResult: null, answer: msg.content ?? "", timings: done(timings, start) };
    }

    const args = parseArgs(call.function.arguments);
    t = performance.now();
    const toolResult = deps.runTool(call.function.name, args);
    timings.toolMs = SINCE(t);

    const messages: ChatMessage[] = [
      { role: "user", content: question },
      msg,
      { role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) },
    ];
    // No tools on the second call: we want the final answer, not another tool call.
    t = performance.now();
    const second = await deps.chat(model, [{ role: "system", content: ANSWER_STYLE }, ...messages]);
    timings.llmMs = SINCE(t);

    return {
      path: "A",
      model,
      tool: call.function.name,
      args,
      toolResult,
      answer: second.choices[0]?.message?.content ?? "",
      timings: done(timings, start),
    };
  } catch (err) {
    throw new RunError((err as Error).message, done(timings, start));
  }
}

// Same style for both paths so the comparison is about who picks the tool, not about answer length.
const ANSWER_STYLE =
  "Write a complete, friendly, well-organized answer in the user's language: open with a full sentence that puts the key facts in context (for example 'Right now in Oslo it is cloudy and 6 °C, so a jacket is a good idea'), then, when the result has several fields, a short list. Never output raw JSON or field names.";

const ANSWER_SYSTEM_PROMPT = [
  "You answer customer questions using only the tool result JSON in the user message. Do not add outside knowledge.",
  'If the tool result has error "missing_data", ask the user for the item named in "missing".',
  'If the tool is "none", say you cannot help with that using the available tools.',
  ANSWER_STYLE,
].join(" ");

// Path B: a decider (Jev) picks the tool and arguments; code runs it; the answering model only reads the result.
export async function runPathB(input: RunInput, deps: Deps & { decider?: Decider } = realDeps) {
  const { model, question, deciderModel } = input;
  const decider = deps.decider ?? createJevDecider(deciderModel);
  const timings: Timings = {};
  const start = performance.now();
  try {
    let t = performance.now();
    const decision = await decider.decide(question);
    timings.decisionMs = SINCE(t);

    t = performance.now();
    const toolResult = decision.tool ? deps.runTool(decision.tool, decision.args) : null;
    timings.toolMs = SINCE(t);

    t = performance.now();
    const reply = await deps.chat(model, [
      { role: "system", content: ANSWER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Question: ${question}\nTool: ${decision.tool ?? "none"}\nTool result JSON: ${JSON.stringify(toolResult)}`,
      },
    ]);
    timings.llmMs = SINCE(t);

    return {
      path: "B",
      model,
      deciderModel,
      tool: decision.tool,
      args: decision.args,
      argSource: decision.argSource,
      probabilities: decision.probabilities,
      toolResult,
      answer: reply.choices[0]?.message?.content ?? "",
      timings: done(timings, start),
    };
  } catch (err) {
    throw new RunError((err as Error).message, done(timings, start));
  }
}

function done(timings: Timings, start: number): Timings {
  return { ...timings, totalMs: SINCE(start) };
}
