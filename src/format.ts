// Whole milliseconds with a thousands separator, e.g. "4,800 ms". Missing stages show a dash.
export const formatMs = (ms: number | undefined): string =>
  ms === undefined ? "–" : `${Math.round(ms).toLocaleString("en-US")} ms`;

// The model answers in light markdown; the UI shows plain text, so drop bold markers and list dashes.
export const plainAnswer = (text: string): string => text.replace(/\*\*/g, "").replace(/^[ \t]*-[ \t]+/gm, "");
