import type { ModelInfo } from "./api";

// Both paths and the judge start on the same cheap model that supports tools; free models are often rate limited.
export function defaultModelId(list: ModelInfo[]): string {
  return (
    list.find((m) => m.id === "openai/gpt-oss-20b")?.id ?? list.find((m) => m.free && m.tools)?.id ?? list.find((m) => m.tools)?.id ?? ""
  );
}
