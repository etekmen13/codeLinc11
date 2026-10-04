import { useEffect, useRef } from "react";
import type { OptionView } from "./flow";

interface Props {
  options: OptionView[];
  selected?: string | null;
  onPick: (option: OptionView) => void;
  disabled?: (option: OptionView) => boolean;
  keys?: boolean; // number keys focus options 1 to 9
}

// Answer options as large words. Number keys focus an option; Enter (or
// Space) on a focused option picks it, as with any button.
export function Options({
  options,
  selected,
  onPick,
  disabled,
  keys = true,
}: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        refs.current[n - 1]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, options.length]);

  return (
    <ul className="options">
      {options.map((o, i) => (
        <li key={o.value}>
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className={o.small ? "option option--small" : "option"}
            aria-pressed={selected === o.value}
            aria-keyshortcuts={keys && i < 9 ? String(i + 1) : undefined}
            disabled={disabled?.(o)}
            onClick={() => onPick(o)}
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
