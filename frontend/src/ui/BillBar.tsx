// A bill as one bar: plan pays, you pay, the balance bill (orange), and what
// the dentist waives. Its length is the bill relative to `maxFee`, so bars
// side by side share a scale.

import type { BillSplit } from "../careplan/derive";
import { formatMoney } from "../lib/coverage";
import { ui } from "../narrative/script";

type Kind = "plan" | "you" | "gap" | "waived";

function segments(split: BillSplit): [Kind, number][] {
  return [
    ["plan", split.planPays],
    ["you", Math.max(0, split.youPay - split.balance)],
    ["gap", split.balance],
    ["waived", split.writtenOff],
  ];
}

export function BillBar({
  split,
  maxFee = split.fee,
  large = false,
}: {
  split: BillSplit;
  maxFee?: number;
  large?: boolean;
}) {
  return (
    <div
      className={`bill-bar${large ? " bill-bar--large" : ""}`}
      aria-hidden="true"
    >
      <div
        className="bill-bar__fill"
        style={{ width: `${(split.fee / Math.max(1, maxFee)) * 100}%` }}
      >
        {segments(split).map(
          ([kind, amount]) =>
            amount >= 0.5 && (
              <span
                key={kind}
                className={`bill-bar__${kind}`}
                style={{ flexGrow: amount }}
              />
            ),
        )}
      </div>
    </div>
  );
}

// The key to the bar. With `split`, each part carries its amount and parts
// that are zero are left out.
export function BillLegend({ split }: { split?: BillSplit }) {
  const l = ui.providers.legend;
  const parts = split
    ? segments(split).filter(([, amount]) => amount >= 0.5)
    : (Object.keys(l) as Kind[]).map((k): [Kind, number] => [k, 0]);
  return (
    <ul
      className={`bill-legend${split ? " bill-legend--amounts" : ""}`}
      aria-hidden={split ? undefined : true}
    >
      {parts.map(([kind, amount]) => (
        <li key={kind}>
          <span className={`bill-legend__swatch bill-bar__${kind}`} />
          {l[kind]}
          {split && <strong className="tabular">{formatMoney(amount)}</strong>}
        </li>
      ))}
    </ul>
  );
}
