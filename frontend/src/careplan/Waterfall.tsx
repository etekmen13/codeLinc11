// The bill as a vertical waterfall: the dentist's fee at the top, then each
// piece of it, then what you owe. Every bar sits on the same scale, offset
// so the pieces visibly add up to the fee. Terms carry their margin notes.

import { formatMoney } from "../lib/coverage";
import { ui } from "../narrative/script";
import type { Step } from "./derive";
import { Term } from "./Term";

interface Props {
  steps: Step[];
  notes: Record<string, string>; // script key -> filled note
  explainBodies: Record<string, unknown>; // script key -> AI request body
}

export function Waterfall({ steps, notes, explainBodies }: Props) {
  const fee = steps.find((s) => s.key === "fee")?.amount ?? 0;
  const scale = (v: number) => (fee > 0 ? (v / fee) * 100 : 0);
  return (
    <ol className="waterfall">
      {steps.map((s) => {
        const label = ui.careplan.waterfall[s.key];
        return (
          <li key={s.key} className={`waterfall__row waterfall__row--${s.who}`}>
            <span className="waterfall__label">
              {s.term && notes[s.term] ? (
                <Term note={notes[s.term]} explainBody={explainBodies[s.term]}>
                  {label}
                </Term>
              ) : (
                label
              )}
            </span>
            <span className="waterfall__track" aria-hidden="true">
              <span
                className="waterfall__bar"
                style={{
                  left: `${scale(s.start)}%`,
                  width: `${Math.max(0.4, scale(s.amount))}%`,
                }}
              />
            </span>
            <span className="waterfall__amount tabular">
              {formatMoney(s.amount)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
