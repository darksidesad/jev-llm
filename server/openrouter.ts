import type { ToolDef } from "./tools";

const OPENROUTER_ROOT = "https://openrouter.ai/api";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ChatCompletion = {
  choices: { message: ChatMessage; finish_reason: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

// Shape of GET /api/v1/models entries; prices are USD per token, as strings.
export type RawModel = {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  supported_parameters?: string[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error("OPENROUTER_KEY is not set");
  const res = await fetch(`${OPENROUTER_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export function fetchModels(): Promise<{ data: RawModel[] }> {
  return request("/v1/models");
}

export function chat(
  model: string,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<ChatCompletion> {
  return request("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages, ...(tools ? { tools } : {}) }),
  });
}

// Jev Decisions API (alpha). Only Choice questions are used; Jev returns no free text.
export type JevChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities: Record<string, number>;
};

export type JevRequest = {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, JevChoiceQuestion>;
};

export type JevResponse = {
  model: string;
  answers: Record<string, JevChoiceAnswer>;
  usage?: { cost?: number; input_tokens: number; output_tokens: number };
};

export function jevDecide(body: JevRequest): Promise<JevResponse> {
  return request("/alpha/decisions", { method: "POST", body: JSON.stringify(body) });
}
