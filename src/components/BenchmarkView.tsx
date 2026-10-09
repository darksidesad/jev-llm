import { Fragment, useEffect, useRef, useState } from "react";
import {
  getBenchmarkItems,
  runBenchmarkItem,
  type BenchItem,
  type BenchItemResponse,
  type Judge,
  type ModelInfo,
  type PathBench,
} from "../api";
import { defaultModelId } from "../defaultModel";
import { formatMs } from "../format";
import { ModelPicker } from "./ModelPicker";

type Row = { status: "running" } | { status: "done"; response: BenchItemResponse } | { status: "error"; message: string };
type OkBench = Extract<PathBench, { result: unknown }>;
type Scores = { clarity: number; faithfulness: number };
type Picks = { a?: string; b?: string; judge?: string };
type Summary = ReturnType<typeof summarize>;

type Props = { models: ModelInfo[] | null; modelsError: string | null };

const isOk = (b: PathBench): b is OkBench => "result" in b;
const isScores = (j: Judge): j is Scores => "clarity" in j;
const isNumber = (n: number | undefined): n is number => n !== undefined;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : null);
const percent = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const score = (x: number | null) => (x === null ? "–" : x.toFixed(1));

// Failures count as wrong in the accuracy figures; the means use only the runs that succeeded.
function summarize(path: "a" | "b", responses: BenchItemResponse[], rowErrors: number) {
  const finished = responses.length + rowErrors;
  const benches = responses.map((r) => r[path]);
  const ok = benches.filter(isOk);
  const scores = ok.map((b) => b.judge).filter(isScores);
  return {
    toolAcc: finished ? benches.filter((b) => b.toolCorrect).length / finished : null,
    argsAcc: finished ? benches.filter((b) => b.argsCorrect).length / finished : null,
    failed: rowErrors + benches.length - ok.length,
    decision: mean(ok.map((b) => b.result.timings.decisionMs).filter(isNumber)),
    total: mean(ok.map((b) => b.result.timings.totalMs).filter(isNumber)),
    clarity: mean(scores.map((s) => s.clarity)),
    faithfulness: mean(scores.map((s) => s.faithfulness)),
  };
}

const SUMMARY_ROWS: { label: string; text: (s: Summary) => string }[] = [
  { label: "Tool accuracy", text: (s) => percent(s.toolAcc) },
  { label: "Args accuracy", text: (s) => percent(s.argsAcc) },
  { label: "Failed runs", text: (s) => String(s.failed) },
  { label: "Mean decision time", text: (s) => formatMs(s.decision ?? undefined) },
  { label: "Mean total time", text: (s) => formatMs(s.total ?? undefined) },
  { label: "Mean clarity (1 to 5)", text: (s) => score(s.clarity) },
  { label: "Mean faithfulness (1 to 5)", text: (s) => score(s.faithfulness) },
];

export function BenchmarkView({ models, modelsError }: Props) {
  const [items, setItems] = useState<BenchItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getBenchmarkItems().then(setItems, (err: Error) => setItemsError(err.message));
  }, []);

  const list = models ?? [];
  const fallback = defaultModelId(list);
  // A pick is kept only while it is in the list and allowed for its role (path A needs tools).
  const choose = (pick: string | undefined, needTools: boolean) =>
    pick !== undefined && list.some((m) => m.id === pick && (!needTools || m.tools)) ? pick : fallback;
  const modelA = choose(picks.a, true);
  const modelB = choose(picks.b, false);
  const judge = choose(picks.judge, false);
  const canRun = items !== null && items.length > 0 && list.length > 0 && !running;

  const setRow = (id: string, row: Row | null) =>
    setRows((current) => {
      const next = { ...current };
      if (row) next[id] = row;
      else delete next[id];
      return next;
    });

  // Items run one after another; a failed item is recorded in its row and the loop continues.
  const run = async () => {
    if (!items || !canRun) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setRows({});
    for (const item of items) {
      if (controller.signal.aborted) break;
      setRow(item.id, { status: "running" });
      try {
        const response = await runBenchmarkItem({ itemId: item.id, modelA, modelB, judgeModel: judge }, controller.signal);
        setRow(item.id, { status: "done", response });
      } catch (err) {
        // Stop aborts the request; that item goes back to not run instead of failed.
        if (controller.signal.aborted) {
          setRow(item.id, null);
          break;
        }
        setRow(item.id, { status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }
    controllerRef.current = null;
    setRunning(false);
  };

  const total = items?.length ?? 0;
  const responses = Object.values(rows).flatMap((r) => (r.status === "done" ? [r.response] : []));
  const rowErrors = Object.values(rows).filter((r) => r.status === "error").length;
  const doneCount = responses.length + rowErrors;
  const progress = running ? `Running item ${doneCount + 1} of ${total}` : doneCount > 0 ? `${doneCount} of ${total} done` : "";

  return (
    <section className="bench" aria-labelledby="bench-heading">
      <h2 id="bench-heading" className="bench-title">
        Benchmark
      </h2>
      <p className="lede">
        Each question runs through Path A and Path B. A judge model scores every answer for clarity and faithfulness, and it
        does not know which path wrote the answer.
      </p>

      {modelsError && <p className="notice notice-error" role="alert">Could not load models: {modelsError}</p>}
      {!models && !modelsError && <p className="notice">Loading models...</p>}
      {itemsError && <p className="notice notice-error" role="alert">Could not load questions: {itemsError}</p>}

      {models && (
        <div className="bench-pickers">
          <ModelPicker
            label="Path A model (tools only)"
            models={models}
            value={modelA}
            onChange={(id) => setPicks((p) => ({ ...p, a: id }))}
            toolsRequired
          />
          <ModelPicker
            label="Path B model"
            models={models}
            value={modelB}
            onChange={(id) => setPicks((p) => ({ ...p, b: id }))}
            toolsRequired={false}
          />
          <ModelPicker
            label="Judge model"
            models={models}
            value={judge}
            onChange={(id) => setPicks((p) => ({ ...p, judge: id }))}
            toolsRequired={false}
          />
        </div>
      )}

      <div className="bench-actions">
        <button type="button" className="run" onClick={() => void run()} disabled={!canRun}>
          Run benchmark
        </button>
        <button type="button" className="example" onClick={() => controllerRef.current?.abort()} disabled={!running}>
          Stop
        </button>
        <p className="bench-progress num" aria-live="polite">
          {progress}
        </p>
      </div>

      {doneCount > 0 && (
        <table className="bench-summary">
          <caption>
            Summary over {doneCount} of {total} questions
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="path-a bench-first">Path A</th>
              <th scope="col" className="path-b">Path B</th>
            </tr>
          </thead>
          <tbody>
            {SUMMARY_ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="num path-a bench-first">{row.text(summarize("a", responses, rowErrors))}</td>
                <td className="num path-b">{row.text(summarize("b", responses, rowErrors))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="bench-scroll" role="region" aria-label="Benchmark results" tabIndex={0}>
        <table className="bench-table">
          <caption className="visually-hidden">
            One row per question, with each path's tool, arguments, timings and judge scores
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Question</th>
              <th scope="col" rowSpan={2}>Expected tool</th>
              <th scope="colgroup" colSpan={5} className="path-a bench-group">Path A</th>
              <th scope="colgroup" colSpan={5} className="path-b bench-group">Path B</th>
            </tr>
            <tr>
              {(["a", "b"] as const).map((p) => (
                <Fragment key={p}>
                  <th scope="col" className={p === "a" ? "path-a bench-first" : "path-b"}>Tool</th>
                  <th scope="col">Args</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Total</th>
                  <th scope="col">Clarity / faithfulness</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <ItemRow key={item.id} item={item} row={rows[item.id]} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemRow({ item, row }: { item: BenchItem; row: Row | undefined }) {
  if (row?.status !== "done") {
    const note = !row ? "Not run yet" : row.status === "running" ? "Running" : `Request failed: ${row.message}`;
    return (
      <tr>
        <th scope="row" className="bench-question">{item.question}</th>
        <td>{item.expectedTool}</td>
        <td colSpan={10} className={row?.status === "error" ? "bench-note bench-fail" : "bench-note"}>
          {note}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row" className="bench-question">{item.question}</th>
      <td>{item.expectedTool}</td>
      <PathCells path="a" bench={row.response.a} />
      <PathCells path="b" bench={row.response.b} />
    </tr>
  );
}

function PathCells({ path, bench }: { path: "a" | "b"; bench: PathBench }) {
  const cls = `path-${path} bench-first`;
  if (!isOk(bench)) {
    return (
      <td colSpan={5} className={`bench-note bench-fail ${cls}`}>
        Failed: {bench.error}
      </td>
    );
  }
  const t = bench.result.timings;
  const { judge } = bench;
  return (
    <>
      <td className={cls}>
        <span className="bench-tool">{bench.result.tool ?? "none"}</span> <Mark ok={bench.toolCorrect} />
      </td>
      <td>
        <Mark ok={bench.argsCorrect} />
      </td>
      <td className="num">{formatMs(t.decisionMs)}</td>
      <td className="num">{formatMs(t.totalMs)}</td>
      <td className="num">
        {isScores(judge) ? (
          `${judge.clarity} / ${judge.faithfulness}`
        ) : (
          <span className="bench-fail" title={judge.error}>
            Judge failed
          </span>
        )}
      </td>
    </>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "mark" : "mark mark-miss"}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span className="visually-hidden">{ok ? " correct" : " wrong"}</span>
    </span>
  );
}
