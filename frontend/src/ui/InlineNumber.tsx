import { useEffect, useId, useRef, useState } from "react";

interface Props {
  value: number; // dollars, or a fraction for percentages
  label: string; // the value as the sentence shows it
  name: string; // accessible name of the number
  unit: "money" | "percent";
  max?: number; // in the same units as value
  note?: string; // shown on hover or focus, next to the number
  muted?: boolean; // a placeholder value, not the reader's own
  onChange: (value: number) => void;
}

// A number in a sentence that turns into a field when clicked. Enter or
// leaving the field keeps the edit; Escape drops it.
export function InlineNumber({
  value,
  label,
  name,
  unit,
  max,
  note,
  muted,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const noteId = useId();
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const shown = unit === "percent" ? Math.round(value * 100) : value;
  const commit = () => {
    setEditing(false);
    const n = Number(draft.replace(/[$,%\s]/g, ""));
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) return;
    let v = unit === "percent" ? Math.min(n, 100) / 100 : n;
    if (max !== undefined) v = Math.min(v, max);
    if (v !== value) onChange(v);
  };

  if (editing)
    return (
      <input
        ref={input}
        className="inline-input inline-number__input"
        inputMode="decimal"
        aria-label={name}
        value={draft}
        size={Math.max(3, draft.length + 1)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );

  return (
    <span className="inline-number">
      <button
        type="button"
        className={muted ? "editable editable--muted" : "editable"}
        aria-label={`${name}: ${label}`}
        aria-describedby={note ? noteId : undefined}
        onClick={() => {
          setDraft(String(shown));
          setEditing(true);
        }}
      >
        {label}
      </button>
      {note && (
        <span id={noteId} role="tooltip" className="inline-number__note">
          {note}
        </span>
      )}
    </span>
  );
}
