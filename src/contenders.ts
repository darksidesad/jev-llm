import type { Contender, Mode, ModelInfo } from "./api";
import { defaultJevModel, defaultNativeModel } from "./defaultModel";

export const MAX_CONTENDERS = 4;
const STORAGE_KEY = "jev-llm.contenders";

export const MODES: { id: Mode; label: string }[] = [
  { id: "native", label: "Native tool calling" },
  { id: "jev", label: "Jev picks the tool" },
];

// Colors come from the path classes in styles.css: blue for native, orange for jev.
export const pathClassOf = (mode: Mode) => (mode === "native" ? "path-a" : "path-b");

export function defaultContenders(models: ModelInfo[]): Contender[] {
  return [
    { id: "default-1", mode: "native", model: defaultNativeModel(models) },
    { id: "default-2", mode: "jev", model: defaultJevModel(models) },
  ];
}

// A stored list is used only while every model in it is still listed; otherwise the defaults apply.
export function resolveContenders(models: ModelInfo[], stored: Contender[] | null): Contender[] {
  return stored && stored.every((c) => models.some((m) => m.id === c.model)) ? stored : defaultContenders(models);
}

function parseContender(value: unknown): Contender {
  const c = value as Partial<Record<keyof Contender, unknown>> | null;
  if (typeof c?.id !== "string" || (c.mode !== "native" && c.mode !== "jev") || typeof c.model !== "string") {
    throw new Error("invalid contender");
  }
  return { id: c.id, mode: c.mode, model: c.model };
}

// Structural check only; a stored model that no longer exists is caught by resolveContenders.
export function loadContenders(): Contender[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CONTENDERS) return null;
    const list = value.map(parseContender);
    return new Set(list.map((c) => c.id)).size === list.length ? list : null;
  } catch {
    return null;
  }
}

export function saveContenders(list: Contender[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be blocked; the list still applies for this visit.
  }
}

// A new contender copies the last one's model and takes the opposite mode.
export function newContender(list: Contender[]): Contender {
  const last = list[list.length - 1];
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, mode: last.mode === "native" ? "jev" : "native", model: last.model };
}

export const contenderLabel = (c: Contender, models: ModelInfo[]) =>
  `${models.find((m) => m.id === c.model)?.name ?? c.model} · ${c.mode === "native" ? "native" : "Jev"}`;

// Same-mode contenders get slightly different shades so their bars can be told apart.
export function toneOf(list: Contender[], c: Contender): string {
  const base = c.mode === "native" ? "var(--path-a)" : "var(--path-b)";
  const j = list.filter((x) => x.mode === c.mode).findIndex((x) => x.id === c.id);
  if (j <= 0) return base;
  return c.mode === "native"
    ? `color-mix(in srgb, ${base} ${100 - 20 * j}%, black)`
    : `color-mix(in srgb, ${base} ${100 - 15 * j}%, white)`;
}
