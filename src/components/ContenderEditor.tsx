import { useId } from "react";
import type { Contender, ModelInfo } from "../api";
import { MODES, pathClassOf } from "../contenders";
import { ModelPicker } from "./ModelPicker";

type Props = {
  index: number;
  contender: Contender;
  models: ModelInfo[];
  canRemove: boolean;
  onChange: (next: Contender) => void;
  onRemove: () => void;
};

// Heading, mode, model and hint for one contender. Shared by the Compare columns and the Benchmark pickers.
export function ContenderEditor({ index, contender, models, canRemove, onChange, onRemove }: Props) {
  const uid = useId();
  const n = index + 1;
  const tools = models.find((m) => m.id === contender.model)?.tools;
  return (
    <div className={`contender ${pathClassOf(contender.mode)}`}>
      <div className="contender-head">
        <h2 className="column-title">
          <span className="path-letter" aria-hidden="true">
            {n}
          </span>
          Contender {n}
        </h2>
        {canRemove && (
          <button type="button" className="example" aria-label={`Remove contender ${n}`} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="segmented mode-switch" role="radiogroup" aria-label={`Mode for contender ${n}`}>
        {MODES.map((m) => (
          <label key={m.id} className={contender.mode === m.id ? "segment is-on" : "segment"}>
            <input
              type="radio"
              name={`${uid}-mode`}
              value={m.id}
              checked={contender.mode === m.id}
              onChange={() => onChange({ ...contender, mode: m.id })}
            />
            {m.label}
          </label>
        ))}
      </div>
      <ModelPicker
        label="Model"
        models={models}
        value={contender.model}
        onChange={(model) => onChange({ ...contender, model })}
      />
      {contender.mode === "native" && tools === false && (
        <p className="notice">
          This model has no native tool calling, so native mode is expected to fail. Jev mode can still use it.
        </p>
      )}
    </div>
  );
}
