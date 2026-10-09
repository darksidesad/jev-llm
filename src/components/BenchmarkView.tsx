import { Fragment, useEffect, useRef, useState } from "react";
import {
  getBenchmarkItems,
  runBenchmarkItem,
  type BenchItem,
  type BenchItemResponse,
  type Contender,
  type ContenderBench,
  type Judge,
  type ModelInfo,
} from "../api";
import { MAX_CONTENDERS, contenderLabel, newContender, pathClassOf } from "../contenders";
import { defaultJudge } from "../defaultModel";
import { formatMs } from "../format";
import { ContenderEditor } from "./ContenderEditor";
import { ModelPicker } from "./ModelPicker";

type Row = { status: "running" } | { status: "done"; response: BenchItemResponse } | { status: "error"; message: string };
type OkBench = Extract<ContenderBench, { result: unknown }>;
type Scores = { clarity: number; faithfulness: number };

type Props = {
  contenders: Contender[];
  onContendersChange: (next: Contender[]) => void;
  models: ModelInfo[] | null;
  modelsError: string | null;
};

const isOk = (b: ContenderBench): b is OkBench => "result" in b;
const isScores = (j: Judge): j is Scores => "clarity" in j;
const isNumber = (n: number | undefined): n is number => n !== undefined;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : null);
const percent = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const score = (x: number | null) => (x === null ? "–" : x.toFixed(1));

// Failures count as wrong in the accuracy figures; the means use only the runs that succeeded.
function summarize(id: string, responses: BenchItemResponse[], rowErrors: number) {
  const finished = responses.length + rowErrors;
  const benches = responses.flatMap((r) => r.results.filter((x) => x.contenderId === id));
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

type Summary = ReturnType<typeof summarize>;
const SUMMARY_ROWS: { label: string; text: (s: Summary) => string }[] = [
  { label: "Tool accuracy", text: (s) => percent(s.toolAcc) },
  { label: "Args accuracy", text: (s) => percent(s.argsAcc) },
  { label: "Failed runs", text: (s) => String(s.failed) },
  { label: "Mean decision time", text: (s) => formatMs(s.decision ?? undefined) },
  { label: "Mean total time", text: (s) => formatMs(s.total ?? undefined) },
  { label: "Mean clarity (1 to 5)", text: (s) => score(s.clarity) },
  { label: "Mean faithfulness (1 to 5)", text: (s) => score(s.faithfulness) },
];

export function BenchmarkView({ contenders, onContendersChange, models, modelsError }: Props) {
  const [items, setItems] = useState<BenchItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [judgePick, setJudgePick] = useState<string | undefined>(undefined);
  // The contenders the last run started with; the tables keep their columns even if the list changes later.
  const [ran, setRan] = useState<Contender[] | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getBenchmarkItems().then(setItems, (err: Error) => setItemsError(err.message));
  }, []);

  const list = models ?? [];
  // A pick is kept only while it is still in the list; otherwise the default applies.
  const judge = judgePick !== undefined && list.some((m) => m.id === judgePick) ? judgePick : defaultJudge(list);
  const canRun = items !== null && items.length > 0 && list.length > 0 && contenders.length > 0 && !running;
  const columns = ran ?? contenders;

  const setRow = (id: string, row: Row | null) =>
    setRows((current) => {
      const next = { ...current };
      if (row) next[id] = row;
      else delete next[id];
      return next;
    });

  // Items run one after another; the contenders within an item run in parallel on the server.
  // A failed item is recorded in its row and the loop continues.
  const run = async () => {
    if (!items || !canRun) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRan(contenders);
    setRunning(true);
    setRows({});
    for (const item of items) {
      if (controller.signal.aborted) break;
      setRow(item.id, { status: "running" });
      try {
        const response = await runBenchmarkItem({ itemId: item.id, contenders, judgeModel: judge }, controller.signal);
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
        Each question runs through every contender. A judge model scores each answer for clarity and faithfulness, and it
        does not know which mode or model wrote it.
      </p>

      {modelsError && <p className="notice notice-error" role="alert">Could not load models: {modelsError}</p>}
      {!models && !modelsError && <p className="notice">Loading models...</p>}
      {itemsError && <p className="notice notice-error" role="alert">Could not load questions: {itemsError}</p>}

      {models && (
        <>
          <div className="bench-pickers">
            {contenders.map((c, i) => (
              <ContenderEditor
                key={c.id}
                index={i}
                contender={c}
                models={list}
                canRemove={contenders.length > 1}
                onChange={(next) => onContendersChange(contenders.map((x) => (x.id === next.id ? next : x)))}
                onRemove={() => onContendersChange(contenders.filter((x) => x.id !== c.id))}
              />
            ))}
            <ModelPicker label="Judge model" models={models} value={judge} onChange={setJudgePick} />
          </div>
          <div className="bench-actions">
            <button
              type="button"
              className="example"
              onClick={() => onContendersChange([...contenders, newContender(contenders)])}
              disabled={contenders.length >= MAX_CONTENDERS}
            >
              Add contender
            </button>
          </div>
        </>
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
        <div className="bench-scroll">
          <table className="bench-summary">
            <caption>
              Summary over {doneCount} of {total} questions
            </caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={`${pathClassOf(c.mode)} bench-first`}>
                    {contenderLabel(c, list)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUMMARY_ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {columns.map((c) => (
                    <td key={c.id} className={`num ${pathClassOf(c.mode)} bench-first`}>
                      {row.text(summarize(c.id, responses, rowErrors))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bench-scroll" role="region" aria-label="Benchmark results" tabIndex={0}>
        <table className="bench-table">
          <caption className="visually-hidden">
            One row per question, with each contender's tool, arguments, timings and judge scores
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Question</th>
              <th scope="col" rowSpan={2}>Expected tool</th>
              {columns.map((c) => (
                <th key={c.id} scope="colgroup" colSpan={5} className={`${pathClassOf(c.mode)} bench-group`}>
                  {contenderLabel(c, list)}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <Fragment key={c.id}>
                  <th scope="col" className={`${pathClassOf(c.mode)} bench-first`}>Tool</th>
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
              <ItemRow key={item.id} item={item} row={rows[item.id]} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemRow({ item, row, columns }: { item: BenchItem; row: Row | undefined; columns: Contender[] }) {
  if (row?.status !== "done") {
    const note = !row ? "Not run yet" : row.status === "running" ? "Running" : `Request failed: ${row.message}`;
    return (
      <tr>
        <th scope="row" className="bench-question">{item.question}</th>
        <td>{item.expectedTool}</td>
        <td colSpan={5 * columns.length} className={row?.status === "error" ? "bench-note bench-fail" : "bench-note"}>
          {note}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row" className="bench-question">{item.question}</th>
      <td>{item.expectedTool}</td>
      {columns.map((c) => (
        <PathCells key={c.id} mode={c.mode} bench={row.response.results.find((r) => r.contenderId === c.id)} />
      ))}
    </tr>
  );
}

function PathCells({ mode, bench }: { mode: Contender["mode"]; bench: ContenderBench | undefined }) {
  const cls = `${pathClassOf(mode)} bench-first`;
  if (!bench) {
    return (
      <td colSpan={5} className={`bench-note ${cls}`}>
        No result
      </td>
    );
  }
  if (!isOk(bench)) {
    return (
      <td colSpan={5} className={`bench-note bench-fail ${cls}`} title={bench.error}>
        Failed: {bench.error.length > 90 ? `${bench.error.slice(0, 90)}…` : bench.error}
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
