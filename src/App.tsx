import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, getModels, runPath, type Contender, type ModelInfo, type RunState } from "./api";
import { BenchmarkView } from "./components/BenchmarkView";
import { ContenderColumn } from "./components/ContenderColumn";
import { RaceStrip, type RaceEntry } from "./components/RaceStrip";
import { MAX_CONTENDERS, contenderLabel, loadContenders, newContender, resolveContenders, saveContenders, toneOf } from "./contenders";

type Tab = "compare" | "benchmark";
const TABS: { id: Tab; label: string }[] = [
  { id: "compare", label: "Compare" },
  { id: "benchmark", label: "Benchmark" },
];

const EXAMPLES = ["Where is my order A1001?", "What is the weather in Madrid right now?", "What is 12 * (3 + 4)?"];
const IDLE: RunState = { status: "idle" };

export default function App() {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [stored, setStored] = useState<Contender[] | null>(loadContenders);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [runId, setRunId] = useState(0);
  const [tab, setTab] = useState<Tab>("compare");
  const latestRun = useRef(0);

  useEffect(() => {
    getModels().then(setModels, (err: Error) => setModelsError(err.message));
  }, []);

  const list = models ?? [];
  const contenders = resolveContenders(list, stored);
  const stateOf = (id: string): RunState => runs[id] ?? IDLE;
  const running = contenders.some((c) => stateOf(c.id).status === "running");
  const canRun = list.length > 0 && question.trim() !== "" && !running;

  // Every change to the list goes through here so the next visit sees it.
  const updateContenders = (next: Contender[]) => {
    setStored(next);
    saveContenders(next);
  };

  // Each contender settles on its own; a result from an older run is dropped.
  const runOne = async (c: Contender, q: string, id: number) => {
    const set = (s: RunState) => setRuns((r) => ({ ...r, [c.id]: s }));
    set({ status: "running", startedAt: performance.now() });
    try {
      const result = await runPath(c.mode === "native" ? "a" : "b", c.model, q);
      if (latestRun.current === id) set({ status: "done", result });
    } catch (err) {
      if (latestRun.current !== id) return;
      set({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        timings: err instanceof ApiError ? err.timings : {},
      });
    }
  };

  const runAll = () => {
    if (!canRun) return;
    const id = latestRun.current + 1;
    latestRun.current = id;
    setRunId(id);
    const q = question.trim();
    void Promise.allSettled(contenders.map((c) => runOne(c, q, id)));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    runAll();
  };

  const onQuestionKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runAll();
    }
  };

  const raceEntries: RaceEntry[] = contenders.map((c) => ({
    key: c.id,
    label: contenderLabel(c, list),
    mode: c.mode,
    tone: toneOf(contenders, c),
    state: stateOf(c.id),
  }));

  return (
    <main className="shell">
      <header>
        <h1>Tool calling race</h1>
        <p className="lede">
          One question goes to up to four contenders at once. Native mode lets the model pick its own tool. Jev mode has
          Jev pick the tool while the model only writes the answer.
        </p>
      </header>

      <nav>
        <div className="tabs" role="tablist" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next: Tab = tab === "compare" ? "benchmark" : "compare";
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" id="panel-compare" aria-labelledby="tab-compare" hidden={tab !== "compare"}>
        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="question">Question</label>
          <textarea
            id="question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onQuestionKey}
          />
          <div className="composer-row">
            <div className="examples" role="group" aria-label="Example questions">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="example" onClick={() => setQuestion(example)}>
                  {example}
                </button>
              ))}
            </div>
            <button type="submit" className="run" disabled={!canRun}>
              Run all
            </button>
          </div>
        </form>

        {modelsError && <p className="notice notice-error" role="alert">Could not load models: {modelsError}</p>}
        {!models && !modelsError && <p className="notice">Loading models...</p>}

        <div aria-live="polite">{runId > 0 && !running && <RaceStrip key={runId} entries={raceEntries} />}</div>

        {models && (
          <>
            <div className="contenders-bar">
              <button
                type="button"
                className="example"
                onClick={() => updateContenders([...contenders, newContender(contenders)])}
                disabled={contenders.length >= MAX_CONTENDERS}
              >
                Add contender
              </button>
            </div>
            <div className="columns">
              {contenders.map((c, i) => (
                <ContenderColumn
                  key={c.id}
                  index={i}
                  contender={c}
                  models={list}
                  canRemove={contenders.length > 1}
                  state={stateOf(c.id)}
                  onChange={(next) => updateContenders(contenders.map((x) => (x.id === next.id ? next : x)))}
                  onRemove={() => updateContenders(contenders.filter((x) => x.id !== c.id))}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div role="tabpanel" id="panel-benchmark" aria-labelledby="tab-benchmark" hidden={tab !== "benchmark"}>
        <BenchmarkView
          contenders={contenders}
          onContendersChange={updateContenders}
          models={models}
          modelsError={modelsError}
        />
      </div>
    </main>
  );
}
