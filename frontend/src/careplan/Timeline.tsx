// The plan year as a line, with the reset drawn as a seam. Each placement of
// the chosen timing plan is a mark on the line; switching plans slides the
// marks across the seam. Draws any number of placements, so a split plan
// needs no change here.

import { formatISODate } from "../lib/coverage";
import { procedurePhrases, ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { day } from "./format";
import type { TimingPlan } from "./timing";

interface Props {
  asOf: string;
  resetsOn: string;
  plans: TimingPlan[];
  chosen: TimingPlan;
  procedureCode: string;
  onChoose: (id: string) => void;
}

export function Timeline({
  asOf,
  resetsOn,
  plans,
  chosen,
  procedureCode,
  onChoose,
}: Props) {
  const dates = [
    asOf,
    resetsOn,
    ...plans.flatMap((p) => p.placements.map((x) => x.date)),
  ];
  const start = day(asOf);
  const end = Math.max(...dates.map(day)) + 45;
  const at = (iso: string) => ((day(iso) - start) / (end - start)) * 100;
  const label = procedurePhrases[procedureCode] ?? procedureCode;

  return (
    <div className="timeline">
      <div
        className="timeline__toggle"
        role="group"
        aria-label={ui.careplan.timingGroup}
      >
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            className="option option--small"
            aria-pressed={p.id === chosen.id}
            onClick={() => onChoose(p.id)}
          >
            {ui.careplan.timingLabels[p.id]}
          </button>
        ))}
      </div>
      <div className="timeline__track">
        <span className="timeline__line" aria-hidden="true" />
        <span className="timeline__today" style={{ left: 0 }}>
          {ui.careplan.today}
        </span>
        <span className="timeline__seam" style={{ left: `${at(resetsOn)}%` }}>
          <span className="timeline__seam-label">
            {fill(ui.careplan.reset, { date: formatISODate(resetsOn) })}
          </span>
        </span>
        {chosen.placements.map((p, i) => (
          <span
            key={i}
            className="timeline__mark"
            style={{ transform: `translateX(${at(p.date)}%)` }}
          >
            <span className="timeline__dot" aria-hidden="true" />
            <span className="timeline__mark-label">
              {label} · <span className="tabular">{formatISODate(p.date)}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
