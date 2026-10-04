// Where the futures end up: one thick bar, one segment per tooth state. Each
// label sits under the left edge of its own segment, so it lines up with it
// exactly. When two labels would collide, the later one drops to a lower
// row (labelRows); a thin rule ties it back up to its segment.

import { useLayoutEffect, useRef } from "react";
import { stateColors } from "../design/tokens";
import { formatPercent } from "../lib/coverage";
import { labelRows } from "../simulation/placeLabels";
import { summary } from "../simulation/playbackConfig";

export function StateBar({
  names,
  shares,
}: {
  names: string[];
  shares: number[];
}) {
  const bar = useRef<HTMLDivElement>(null);
  const segs = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const labeled = shares.flatMap((v, i) =>
    v >= summary.labelMinShare ? [i] : [],
  );
  const key = shares.join(",");

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const place = () => {
      // Everything measured against the bar itself.
      const origin = el.getBoundingClientRect().left;
      const rows = labelRows(
        labeled.map((i) => ({
          left: segs.current[i]!.getBoundingClientRect().left - origin,
          width: labels.current[i]!.getBoundingClientRect().width,
        })),
        summary.labelGap,
        summary.labelRows,
      );
      rows.forEach((row, k) => {
        labels.current[labeled[k]]!.dataset.row = String(row);
      });
      el.style.setProperty("--label-rows", String(Math.max(0, ...rows) + 1));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
    // `labeled` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      className="state-bar"
      ref={bar}
      role="img"
      aria-label={names
        .map((n, i) => `${n} ${formatPercent(shares[i])}`)
        .join(", ")}
    >
      {names.map((n, i) =>
        shares[i] > 0 ? (
          <div
            key={n}
            ref={(el) => {
              segs.current[i] = el;
            }}
            className="state-bar__seg"
            style={{ flexGrow: shares[i], background: stateColors[i] }}
            title={`${n} ${formatPercent(shares[i])}`}
          >
            {shares[i] >= summary.labelMinShare && (
              <span
                className="state-label"
                aria-hidden="true"
                ref={(el) => {
                  labels.current[i] = el;
                }}
              >
                <span className="state-label__name">{n}</span>
                <span className="state-label__share tabular">
                  {formatPercent(shares[i])}
                </span>
              </span>
            )}
          </div>
        ) : null,
      )}
    </div>
  );
}
