import { useEffect, useState } from "react";
import type { RunState, Timings } from "../api";
import { formatMs } from "../format";

const timingsOf = (state: RunState): Timings => {
  if (state.status === "done") return state.result.timings;
  if (state.status === "error") return state.timings;
  return {};
};

// Both states are settled when this runs. A failed path means there is no race to describe.
function summarize(a: RunState, b: RunState): string {
  const failed = [a.status === "error" ? "A" : null, b.status === "error" ? "B" : null].filter(
    (p): p is "A" | "B" => p !== null,
  );
  if (failed.length > 0) return `Path ${failed.join(" and ")} failed, so there is no race result.`;

  const ta = timingsOf(a);
  const tb = timingsOf(b);
  const decA = ta.decisionMs ?? 0;
  const decB = tb.decisionMs ?? 0;
  const totA = ta.totalMs ?? 0;
  const totB = tb.totalMs ?? 0;
  const ratio = (x: number, y: number) => (Math.max(x, y) / Math.max(Math.min(x, y), 1)).toFixed(1);
  const decWinner = decA <= decB ? "A" : "B";
  const totWinner = totA <= totB ? "A" : "B";

  if (decA === decB) return `Both paths chose their tool in ${formatMs(decA)}, and path ${totWinner} finished ${ratio(totA, totB)}x faster overall.`;
  const head = `Path ${decWinner} chose its tool ${ratio(decA, decB)}x faster (${formatMs(Math.min(decA, decB))} vs ${formatMs(Math.max(decA, decB))})`;
  return totWinner === decWinner
    ? `${head} and finished ${ratio(totA, totB)}x faster overall.`
    : `${head}, but finished ${ratio(totA, totB)}x slower overall.`;
}

// Segment labels appear only when the segment is at least this share of its bar; the title and the stages line always give the value.
const LABEL_MIN_PERCENT = 22;

export function RaceStrip({ a, b }: { a: RunState; b: RunState }) {
  const rows = (["A", "B"] as const)
    .map((path) => ({ path, timings: timingsOf(path === "A" ? a : b) }))
    .filter((row) => row.timings.totalMs !== undefined);
  const scale = Math.max(1, ...rows.map((row) => row.timings.totalMs ?? 0));

  return (
    <section className="race" aria-label="Timing race">
      {rows.map((row) => (
        <Bar key={row.path} path={row.path} timings={row.timings} scale={scale} />
      ))}
      <p className="race-summary">{summarize(a, b)}</p>
      <p className="strip-key">The darkest segment is the decision, the middle one the tool, the lightest the LLM answer.</p>
    </section>
  );
}

// The bar length is the path's own total on the shared scale. Stage segments split that length in
// proportion to their time; time not covered by a stage is drawn as the "other" segment.
function Bar({ path, timings, scale }: { path: "A" | "B"; timings: Timings; scale: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const total = timings.totalMs ?? 0;
  const stages = [
    { kind: "decision", label: "Decision", ms: timings.decisionMs ?? 0 },
    { kind: "tool", label: "Tool", ms: timings.toolMs ?? 0 },
    { kind: "answer", label: "LLM answer", ms: timings.llmMs ?? 0 },
  ];
  const other = Math.max(total - stages.reduce((sum, s) => sum + s.ms, 0), 0);
  const description = `Path ${path}: ${stages
    .map((s) => `${s.label.toLowerCase()} ${formatMs(s.ms)}`)
    .join(", ")}, total ${formatMs(total)}`;

  return (
    <div className={`bar-block path-${path.toLowerCase()}`}>
      <div className="bar-row">
        <span className="bar-letter" aria-hidden="true">
          {path}
        </span>
        <div className="bar-lane">
          <div
            className="bar-fill"
            role="img"
            aria-label={description}
            style={{ width: `${grown ? (total / scale) * 100 : 0}%` }}
          >
            {stages.map((s) => {
              const share = total > 0 ? (s.ms / total) * 100 : 0;
              return (
                <div
                  key={s.kind}
                  className={`seg seg-${s.kind}`}
                  style={{ flex: `${s.ms} 1 0` }}
                  title={`${s.label}: ${formatMs(s.ms)}`}
                >
                  {share >= LABEL_MIN_PERCENT && <span className="num">{formatMs(s.ms)}</span>}
                </div>
              );
            })}
            {other > 0 && (
              <div className="seg seg-other" style={{ flex: `${other} 1 0` }} title={`Other: ${formatMs(other)}`} />
            )}
          </div>
        </div>
        <span className="bar-total num">{formatMs(total)}</span>
      </div>
      <p className="stages num">
        decision {formatMs(timings.decisionMs ?? 0)} · tool {formatMs(timings.toolMs ?? 0)} · answer{" "}
        {formatMs(timings.llmMs ?? 0)}
      </p>
    </div>
  );
}
