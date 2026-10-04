import type { RiskBand } from "../types";
import { money, percent } from "./format";
export function Tolerance({
  bands,
  value,
  onChange,
}: {
  bands: RiskBand[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="cp-tolerance">
      <legend>Escalation-risk tolerance</legend>
      <div>
        {bands.map((b) => (
          <label key={b.name} className={value === b.name ? "chosen" : ""}>
            <input
              type="radio"
              name="risk-tolerance"
              checked={value === b.name}
              onChange={() => onChange(b.name)}
            />
            <strong>{b.name}</strong>
            <span>
              {b.upper === null
                ? "No upper limit"
                : `Below ${percent(b.upper)}`}
            </span>
          </label>
        ))}
      </div>
      <p>
        Controls which simulated risk bands enter the cost comparison; it does
        not establish safe treatment timing.
      </p>
    </fieldset>
  );
}
export function SegmentedBar({
  segments,
  label,
}: {
  segments: { name: string; value: number; className: string }[];
  label: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <>
      <div
        className="cp-bar"
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.name} ${money(s.value)}`).join(", ")}`}
      >
        {segments.map((s) => (
          <span
            key={s.name}
            className={s.className}
            style={{
              width: `${total > 0 ? (Math.max(0, s.value) / total) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <ul className="cp-legend">
        {segments.map((s) => (
          <li key={s.name}>
            <i className={s.className} />
            {s.name}: <strong>{money(s.value)}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}
