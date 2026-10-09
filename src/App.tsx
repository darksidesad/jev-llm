import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, getModels, runPath, type ModelInfo, type RunState } from "./api";
import { BenchmarkView } from "./components/BenchmarkView";
import { PathColumn } from "./components/PathColumn";
import { RaceStrip } from "./components/RaceStrip";
import { defaultModelId } from "./defaultModel";

type Tab = "compare" | "benchmark";
const TABS: { id: Tab; label: string }[] = [
  { id: "compare", label: "Compare" },
  { id: "benchmark", label: "Benchmark" },
];

const EXAMPLES = ["Where is my order A1001?", "What is the weather in Madrid right now?", "What is 12 * (3 + 4)?"];
const STORAGE_KEYS = { a: "jev-llm.model.a", b: "jev-llm.model.b" } as const;
const IDLE: RunState = { status: "idle" };

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the choice still applies for this visit.
  }
}

// A stored choice is kept only while it is in the list and allowed for its path.
function resolveModel(models: ModelInfo[], stored: string | null, needTools: boolean, fallback: string): string {
  return stored !== null && models.some((m) => m.id === stored && (!needTools || m.tools)) ? stored : fallback;
}

const settled = (s: RunState) => s.status === "done" || s.status === "error";

export default function App() {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [stored, setStored] = useState(() => ({ a: readStored(STORAGE_KEYS.a), b: readStored(STORAGE_KEYS.b) }));
  const [colA, setColA] = useState<RunState>(IDLE);
  const [colB, setColB] = useState<RunState>(IDLE);
  const [runId, setRunId] = useState(0);
  const [tab, setTab] = useState<Tab>("compare");
  const latestRun = useRef(0);

  useEffect(() => {
    getModels().then(setModels, (err: Error) => setModelsError(err.message));
  }, []);

  const list = models ?? [];
  const defaultModel = defaultModelId(list);
  const modelA = resolveModel(list, stored.a, true, defaultModel);
  const modelB = resolveModel(list, stored.b, false, defaultModel);
  const running = colA.status === "running" || colB.status === "running";
  const canRun = list.length > 0 && question.trim() !== "" && !running;

  const pickModel = (path: "a" | "b") => (id: string) => {
    setStored((s) => (path === "a" ? { ...s, a: id } : { ...s, b: id }));
    writeStored(STORAGE_KEYS[path], id);
  };

  // Each column settles on its own; a result from an older run is dropped.
  const runInto = async (path: "a" | "b", model: string, q: string, id: number, set: (s: RunState) => void) => {
    set({ status: "running", startedAt: performance.now() });
    try {
      const result = await runPath(path, model, q);
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

  const runBoth = () => {
    if (!canRun) return;
    const id = latestRun.current + 1;
    latestRun.current = id;
    setRunId(id);
    const q = question.trim();
    void Promise.allSettled([runInto("a", modelA, q, id, setColA), runInto("b", modelB, q, id, setColB)]);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    runBoth();
  };

  const onQuestionKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runBoth();
    }
  };

  return (
    <main className="shell">
      <header>
        <h1>Tool calling race</h1>
        <p className="lede">
          The same question goes to two pipelines: an LLM that picks its own tool (A), and Jev picking the tool while an
          LLM only writes the answer (B).
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
            Run both paths
          </button>
        </div>
      </form>

      {modelsError && <p className="notice notice-error" role="alert">Could not load models: {modelsError}</p>}
      {!models && !modelsError && <p className="notice">Loading models...</p>}

      <div aria-live="polite">{settled(colA) && settled(colB) && <RaceStrip key={runId} a={colA} b={colB} />}</div>

      <div className="columns">
        <PathColumn
          path="A"
          title="LLM with tool calling"
          models={models}
          model={modelA}
          onModelChange={pickModel("a")}
          state={colA}
        />
        <PathColumn
          path="B"
          title="Jev picks the tool, LLM answers"
          models={models}
          model={modelB}
          onModelChange={pickModel("b")}
          state={colB}
        />
      </div>
      </div>

      <div role="tabpanel" id="panel-benchmark" aria-labelledby="tab-benchmark" hidden={tab !== "benchmark"}>
        <BenchmarkView models={models} modelsError={modelsError} />
      </div>
    </main>
  );
}
