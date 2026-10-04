import { useEffect, useId, useRef, useState } from "react";

export interface Choice {
  value: string;
  label: string;
}

interface Props {
  label: string; // the word shown in the sentence
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  name: string; // accessible name of what is being chosen
}

// A word in a sentence that opens a short list of alternatives in place.
// Escape or a click elsewhere closes it.
export function InlineChoice({ label, choices, value, onChange, name }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span className="inline-choice" ref={root}>
      <button
        type="button"
        className="editable"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${name}: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <span
          className="inline-choice__list"
          id={id}
          role="group"
          aria-label={name}
        >
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              className="option option--small"
              aria-pressed={c.value === value}
              onClick={() => {
                onChange(c.value);
                setOpen(false);
              }}
            >
              {c.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
