import { meterFigures } from "../careplan/derive";
import { formatMoney } from "../lib/coverage";
import { ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../state/store";

// A hairline along the bottom edge: used, scheduled, remaining. Appears once
// a plan is chosen and follows the care plan's timing. Figures on hover or
// focus.
export function AnnualMaxMeter() {
  const m = useStore(useShallow(meterFigures));
  if (!m) return null;
  const w = (v: number) => `${(v / m.max) * 100}%`;
  const text = [
    fill(ui.meter.used, { amount: formatMoney(m.used) }),
    fill(ui.meter.scheduled, { amount: formatMoney(m.scheduled) }),
    fill(ui.meter.remaining, {
      amount: formatMoney(m.remaining),
      max: formatMoney(m.max),
    }),
  ];
  return (
    <div
      className="meter"
      tabIndex={0}
      role="img"
      aria-label={`${ui.meter.label}: ${text.join(", ")}`}
    >
      <div className="meter__bar" aria-hidden="true">
        <span className="meter__used" style={{ width: w(m.used) }} />
        <span className="meter__scheduled" style={{ width: w(m.scheduled) }} />
      </div>
      <p className="meter__figures tabular" aria-hidden="true">
        <span>{ui.meter.label}</span>
        {text.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </div>
  );
}
