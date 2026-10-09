import { useEffect, useState } from "react";
import type { ModelInfo, RunResult, RunState, Timings } from "../api";
import { formatMs, plainAnswer } from "../format";
import { ModelPicker } from "./ModelPicker";

type Props = {
  path: "A" | "B";
  title: string;
  models: ModelInfo[] | null;
  model: string;
  onModelChange: (id: string) => void;
  state: RunState;
};

export function PathColumn({ path, title, models, model, onModelChange, state }: Props) {
  const headingId = `column-${path}-heading`;
  return (
    <section className={`column path-${path.toLowerCase()}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="column-title">
        <span className="path-letter" aria-hidden="true">
          {path}
        </span>
        {title}
      </h2>
      {models && (
        <ModelPicker
          label="Model"
          models={models}
          value={model}
          onChange={onModelChange}
          toolsRequired={path === "A"}
        />
      )}
      <div className="column-body" aria-live="polite">
        <Body path={path} state={state} />
      </div>
    </section>
  );
}

function Body({ path, state }: { path: "A" | "B"; state: RunState }) {
  switch (state.status) {
    case "idle":
      return <p className="empty">Run both paths to see this path's tool choice, timings and answer.</p>;
    case "running":
      return <RunningNote startedAt={state.startedAt} />;
    case "error":
      return <ErrorNote path={path} message={state.message} timings={state.timings} />;
    case "done":
      return <Outcome path={path} result={state.result} />;
  }
}

// The elapsed time is hidden from assistive tech so the live region announces only the state change.
function RunningNote({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="running">
      Running. <span className="num" aria-hidden="true">{formatMs(now - startedAt)}</span>
    </p>
  );
}

function ErrorNote({ path, message, timings }: { path: "A" | "B"; message: string; timings: Timings }) {
  const rateLimited = /429|rate.?limit/i.test(message);
  return (
    <div className="error">
      <p className="error-title">
        Path {path} failed{timings.totalMs !== undefined ? ` after ${formatMs(timings.totalMs)}` : ""}.
      </p>
      <pre>{message}</pre>
      <p>
        {rateLimited
          ? "This model is rate limited. Try another model or run again in a moment."
          : "Try another model, or run again in a moment."}
      </p>
    </div>
  );
}

function Outcome({ path, result }: { path: "A" | "B"; result: RunResult }) {
  const args = Object.entries(result.args ?? {}).filter(([, value]) => value !== undefined);
  const probabilities = Object.entries(result.probabilities ?? {}).sort(([, a], [, b]) => b - a);
  const t = result.timings;
  return (
    <div className="outcome">
      <dl className="kv">
        <dt>Chosen tool</dt>
        <dd>{result.tool ?? "none"}</dd>
      </dl>

      <h3>Arguments</h3>
      {args.length === 0 ? (
        <p className="muted">No arguments.</p>
      ) : (
        <ul className="args">
          {args.map(([name, value]) => {
            const source = result.argSource?.[name];
            return (
              <li key={name}>
                <span className="arg-name">{name}</span>
                <span className="arg-value">{typeof value === "string" ? value : JSON.stringify(value)}</span>
                {source && <span className="chip">{source === "jev" ? "Jev" : "code"}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {path === "B" && probabilities.length > 0 && (
        <>
          <h3>Jev probabilities</h3>
          <ul className="probs">
            {probabilities.map(([option, p]) => (
              <li key={option}>
                <span>{option}</span>
                <span className="prob-track" aria-hidden="true">
                  <span style={{ width: `${Math.min(Math.max(p, 0), 1) * 100}%` }} />
                </span>
                <span className="num">{Math.round(p * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="tool-result">
        <summary>Tool result</summary>
        <pre>{JSON.stringify(result.toolResult, null, 2)}</pre>
      </details>

      <h3>Answer</h3>
      <p className="answer">{plainAnswer(result.answer) || "The model returned no text."}</p>

      <h3>Timings</h3>
      <dl className="kv num">
        <dt>Decision</dt>
        <dd>{formatMs(t.decisionMs)}</dd>
        <dt>Tool</dt>
        <dd>{formatMs(t.toolMs)}</dd>
        <dt>LLM answer</dt>
        <dd>{formatMs(t.llmMs)}</dd>
        <dt>Total</dt>
        <dd>{formatMs(t.totalMs)}</dd>
      </dl>
    </div>
  );
}
