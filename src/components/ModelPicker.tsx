import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ModelInfo } from "../api";

type Props = {
  label: string;
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  toolsRequired: boolean;
};

const money = (n: number) => (n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const priceText = (m: ModelInfo) =>
  m.free ? "free" : `${money(m.promptPrice)} in, ${money(m.completionPrice)} out per 1M`;

export function ModelPicker({ label, models, value, onChange, toolsRequired }: Props) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [toolsOnly, setToolsOnly] = useState(false);
  const [active, setActive] = useState(0);

  const selected = models.find((m) => m.id === value);
  const needTools = toolsRequired || toolsOnly;
  const q = query.trim().toLowerCase();
  const matches = models.filter(
    (m) =>
      (!freeOnly || m.free) &&
      (!needTools || m.tools) &&
      (q === "" || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
  );
  const current = matches.length > 0 ? Math.min(active, matches.length - 1) : -1;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (current >= 0) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const choose = (m: ModelInfo) => {
    onChange(m.id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const next = e.key === "ArrowDown" ? current + 1 : current - 1;
      setActive(Math.max(0, Math.min(next, matches.length - 1)));
    } else if (e.key === "Enter" && open && current >= 0) {
      e.preventDefault();
      choose(matches[current]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="picker" ref={rootRef}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        role="combobox"
        type="text"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && current >= 0 ? optionId(current) : undefined}
        placeholder={selected?.name ?? value}
        value={open ? query : (selected?.name ?? value)}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="picker-filters">
        <label>
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => {
              setFreeOnly(e.target.checked);
              setActive(0);
            }}
          />
          Free only
        </label>
        <label>
          <input
            type="checkbox"
            checked={needTools}
            disabled={toolsRequired}
            onChange={(e) => {
              setToolsOnly(e.target.checked);
              setActive(0);
            }}
          />
          Tools only
        </label>
      </div>
      {open &&
        (matches.length > 0 ? (
          <ul id={listId} role="listbox" aria-label="Models" className="picker-list">
            {matches.map((m, i) => (
              <li
                key={m.id}
                id={optionId(i)}
                role="option"
                aria-selected={m.id === value}
                className={i === current ? "opt is-active" : "opt"}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
              >
                <span className="opt-name">{m.name}</span>
                <span className="opt-id">{m.id}</span>
                <span className="opt-price num">{priceText(m)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p id={listId} className="picker-list picker-empty">
            No model matches.
          </p>
        ))}
    </div>
  );
}
