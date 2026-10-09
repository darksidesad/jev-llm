import { useEffect, useState, type CSSProperties } from "react";
import type { Mode, RunState, Timings } from "../api";
import { pathClassOf } from "../contenders";
import { formatMs } from "../format";

export type RaceEntry = { key: string; label: string; mode: Mode; tone: string; state: RunState };

const timingsOf = (state: RunState): Timings => {
  if (state.status === "done") return state.result.timings;
  if (state.status === "error") return state.timings;
  return {};
};

// Only runs that returned are ranked; failed ones are named so the missing bars are explained.
function summarize(entries: RaceEntry[]): string {
  const ok = entries.flatMap((e) => (e.state.status === "done" ? [{ label: e.label, t: e.state.result.timings }] : []));
  const failed = entries.filter((e) => e.state.status === "error").map((e) => e.label);
  const failText = failed.length > 0 ? ` ${failed.length} failed: ${failed.join(", ")}.` : "";
  if (ok.length === 0) return failed.length > 0 ? "Every contender failed, so there is no race result." : "";
  if (ok.length === 1) return `${ok[0].label} finished in ${formatMs(ok[0].t.totalMs)}.${failText}`;

  const byDecision = ok.reduce((best, x) => ((x.t.decisionMs ?? 0) < (best.t.decisionMs ?? 0) ? x : best));
  const byTotal = ok.reduce((best, x) => ((x.t.totalMs ?? 0) < (best.t.totalMs ?? 0) ? x : best));
  const head =
    byDecision === byTotal
      ? `${byTotal.label} was fastest at choosing its tool (${formatMs(byDecision.t.decisionMs)}) and fastest overall (${formatMs(byTotal.t.totalMs)}).`
      : `${byDecision.label} chose its tool fastest (${formatMs(byDecision.t.decisionMs)}), and ${byTotal.label} finished fastest overall (${formatMs(byTotal.t.totalMs)}).`;
  return head + failText;
}

// Segment labels appear only when the segment is at least this share of its bar; the title and the stages line always give the value.
const LABEL_MIN_PERCENT = 22;

export function RaceStrip({ entries }: { entries: RaceEntry[] }) {
  const rows = entries
    .map((entry) => ({ ...entry, timings: timingsOf(entry.state) }))
    .filter((row) => row.timings.totalMs !== undefined);
  const scale = Math.max(1, ...rows.map((row) => row.timings.totalMs ?? 0));

  return (
    <section className="race" aria-label="Timing race">
      {rows.map((row) => (
        <Bar key={row.key} row={row} scale={scale} />
      ))}
      <p className="race-summary">{summarize(entries)}</p>
      <p className="strip-key">The darkest segment is the decision, the middle one the tool, the lightest the LLM answer.</p>
    </section>
  );
}

// The bar length is the contender's own total on the shared scale. Stage segments split that length in
// proportion to their time; time not covered by a stage is drawn as the "other" segment.
function Bar({ row, scale }: { row: RaceEntry & { timings: Timings }; scale: number }) {
  const { label, timings } = row;
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
  const description = `${label}: ${stages
    .map((s) => `${s.label.toLowerCase()} ${formatMs(s.ms)}`)
    .join(", ")}, total ${formatMs(total)}`;

  return (
    <div className={`bar-block ${pathClassOf(row.mode)}`} style={{ "--path": row.tone } as CSSProperties}>
      <p className="bar-label" title={label}>
        {label}
      </p>
      <div className="bar-row">
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
