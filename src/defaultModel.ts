import type { ModelInfo } from "./api";

// Negative prices mark variable-cost routers, which are never a default.
export const isVariable = (m: ModelInfo) => m.promptPrice < 0 || m.completionPrice < 0;

const find = (list: ModelInfo[], pred: (m: ModelInfo) => boolean) => list.find(pred)?.id;

// Native mode: the cheap model with native tool calling; any model can still be picked.
export function defaultNativeModel(list: ModelInfo[]): string {
  return (
    find(list, (m) => m.id === "openai/gpt-oss-20b") ??
    find(list, (m) => m.free && m.tools) ??
    find(list, (m) => m.tools) ??
    ""
  );
}

// Jev mode: a small model without native tool calling, which Jev gives tools to.
export function defaultJevModel(list: ModelInfo[]): string {
  return find(list, (m) => m.id === "cohere/command-r7b-12-2024") ?? find(list, (m) => !m.tools && !isVariable(m)) ?? "";
}

// Judge: the same cheap tool-capable model as the native default.
export function defaultJudge(list: ModelInfo[]): string {
  return find(list, (m) => m.id === "openai/gpt-oss-20b") ?? defaultNativeModel(list);
}
