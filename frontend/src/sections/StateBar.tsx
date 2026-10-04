// Where the futures end up: one thick bar, one segment per tooth state, each
// labeled underneath with its name and share. Labels are measured and placed
// so they never overlap (placeLabels); a leader line runs from each
// segment's middle to its label, even when crowding moves the label aside.
// Placement is written straight to the DOM before paint.

import { useLayoutEffect, useRef } from "react";
import { stateColors } from "../design/tokens";
import { formatPercent } from "../lib/coverage";
import { placeLabels } from "../simulation/placeLabels";
import { summary } from "../simulation/playbackConfig";

export function StateBar({
  names,
  shares,
}: {
  names: string[];
  shares: number[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const segs = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const leaders = useRef<(SVGLineElement | null)[]>([]);
  const labeled = shares.flatMap((v, i) =>
    v >= summary.labelMinShare ? [i] : [],
  );
  const key = shares.join(",");

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const place = () => {
      const items = labeled.map((i) => {
        const seg = segs.current[i]!;
        return {
          center: seg.offsetLeft + seg.offsetWidth / 2,
          width: labels.current[i]!.offsetWidth,
        };
      });
      const placed = placeLabels(
        items,
        el.clientWidth,
        summary.labelGap,
        summary.labelRows,
      );
      let rows = 1;
      for (const { row } of placed) rows = Math.max(rows, row + 1);
      el.style.setProperty("--label-rows", String(rows));
      placed.forEach(({ x, row }, k) => {
        const i = labeled[k];
        const label = labels.current[i]!;
        label.style.left = `${x}px`;
        label.dataset.row = String(row);
        const line = leaders.current[i]!;
        line.setAttribute("x1", String(items[k].center));
        line.setAttribute("y1", "0");
        line.setAttribute("x2", String(x + items[k].width / 2));
        line.setAttribute("y2", String(label.offsetTop));
      });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
    // `labeled` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="state-chart" ref={wrap}>
      <div
        className="state-bar"
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
            />
          ) : null,
        )}
      </div>
      <div className="state-labels" aria-hidden="true">
        <svg className="state-leaders">
          {labeled.map((i) => (
            <line
              key={i}
              ref={(el) => {
                leaders.current[i] = el;
              }}
            />
          ))}
        </svg>
        {labeled.map((i) => (
          <span
            key={i}
            className="state-label"
            ref={(el) => {
              labels.current[i] = el;
            }}
          >
            <span className="state-label__name">{names[i]}</span>
            <span className="state-label__share tabular">
              {formatPercent(shares[i])}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
