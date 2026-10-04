import { useRef } from "react";
import { closingFigures } from "../careplan/derive";
import { formatISODate, formatMoney } from "../lib/coverage";
import { useParallax } from "../motion/hooks";
import { ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../state/store";

// What expires at the reset, in the one place orange gets to be loud.
export function Closing() {
  const figures = useStore(useShallow(closingFigures));
  const figure = useRef<HTMLDivElement>(null);
  useParallax(figure);
  if (!figures) return <div className="closing" />;
  return (
    <div className="closing">
      <div ref={figure} className="closing__figure">
        {figures.unused >= 1 ? (
          <>
            <p className="figure figure--hero figure--loss tabular">
              {figures.unusedLabel}
            </p>
            <p className="closing__expiry">
              {fill(ui.closing.expires, {
                date: formatISODate(figures.expiry),
              })}
            </p>
          </>
        ) : (
          <>
            <p className="figure figure--hero tabular">
              {figures.annualMaximumLabel}
            </p>
            <p className="closing__expiry">
              {fill(ui.closing.resets, {
                date: formatISODate(figures.resetsOn),
              })}
            </p>
          </>
        )}
        {figures.fsaForfeited > 0 && figures.fsaDeadline && (
          <p className="quiet tabular">
            {fill(ui.closing.fsa, {
              amount: formatMoney(figures.fsaForfeited),
              date: formatISODate(figures.fsaDeadline),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
