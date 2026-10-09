import { fetchModels, type RawModel } from "./openrouter";

export type ModelInfo = {
  id: string;
  name: string;
  tools: boolean;
  free: boolean;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; models: ModelInfo[] } | null = null;

// Prices are per token in OpenRouter; the UI shows per 1M tokens. toFixed drops float noise.
const perMillion = (price: string) => Number((Number(price) * 1_000_000).toFixed(6));

export function toModelInfo(m: RawModel): ModelInfo {
  const promptPrice = perMillion(m.pricing.prompt);
  const completionPrice = perMillion(m.pricing.completion);
  return {
    id: m.id,
    name: m.name,
    tools: m.supported_parameters?.includes("tools") ?? false,
    // Negative prices mark variable-cost routers: never free.
    free: promptPrice >= 0 && completionPrice >= 0 && (m.id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0)),
    promptPrice,
    completionPrice,
    contextLength: m.context_length,
  };
}

export async function getModels(): Promise<ModelInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  const { data } = await fetchModels();
  const models = data.map(toModelInfo);
  cache = { at: Date.now(), models };
  return models;
}
