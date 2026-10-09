import { useEffect, useState } from "react";
import type { Contender, Mode, ModelInfo, RunResult, RunState, Timings } from "../api";
import { pathClassOf } from "../contenders";
import { formatMs, plainAnswer } from "../format";
import { ContenderEditor } from "./ContenderEditor";

type Props = {
  index: number;
  contender: Contender;
  models: ModelInfo[];
  canRemove: boolean;
  state: RunState;
  onChange: (next: Contender) => void;
  onRemove: () => void;
};

export function ContenderColumn({ index, contender, models, canRemove, state, onChange, onRemove }: Props) {
  return (
    <section className={`column ${pathClassOf(contender.mode)}`} aria-label={`Contender ${index + 1}`}>
      <ContenderEditor
        index={index}
        contender={contender}
        models={models}
        canRemove={canRemove}
        onChange={onChange}
        onRemove={onRemove}
      />
      <div className="column-body" aria-live="polite">
        <Body mode={contender.mode} state={state} />
      </div>
    </section>
  );
}

function Body({ mode, state }: { mode: Mode; state: RunState }) {
  switch (state.status) {
    case "idle":
      return <p className="empty">Run to see this contender's tool choice, timings and answer.</p>;
    case "running":
      return <RunningNote startedAt={state.startedAt} />;
    case "error":
      return <ErrorNote mode={mode} message={state.message} timings={state.timings} />;
    case "done":
      return <Outcome mode={mode} result={state.result} />;
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

function ErrorNote({ mode, message, timings }: { mode: Mode; message: string; timings: Timings }) {
  const rateLimited = /429|rate.?limit/i.test(message);
  // Native mode sends tools; OpenRouter answers a model without tool support with an endpoints/tool error.
  const noToolSupport = mode === "native" && /tool|endpoints?/i.test(message);
  return (
    <div className="error">
      <p className="error-title">
        This run failed{timings.totalMs !== undefined ? ` after ${formatMs(timings.totalMs)}` : ""}.
      </p>
      <pre>{message}</pre>
      <p>
        {rateLimited
          ? "This model is rate limited. Try another model or run again in a moment."
          : noToolSupport
            ? "This model does not support tool calling, so native mode cannot run it. Pick a model with tools, or switch to Jev mode."
            : "Try another model, or run again in a moment."}
      </p>
    </div>
  );
}

function Outcome({ mode, result }: { mode: Mode; result: RunResult }) {
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
            const source = mode === "jev" ? result.argSource?.[name] : undefined;
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

      {mode === "jev" && probabilities.length > 0 && (
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
