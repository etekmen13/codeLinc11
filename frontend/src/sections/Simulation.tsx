// Simulation, Phase 1: v0's Monte Carlo drawing and its numbers, restyled.
// Phase 4 replaces SimIntro with the full-bleed playback.

import { stateColors } from "../design/tokens";
import { bandColor } from "../lib/risk";
import { formatISODate, formatPercent } from "../lib/coverage";
import { ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { fresh, requestKey } from "../state/selectors";
import { useStore } from "../state/store";
import MonteCarloPaper from "../simulation/MonteCarloPaper";
import type { ToothSimulation } from "../types";

const KEY_MONTHS = [0, 3, 6, 12, 18, 24];

function useSimulation(): ToothSimulation | null {
  return useStore((s) => fresh(s.simulation, requestKey(s)));
}

export function SimIntro({ reached }: { reached: boolean }) {
  const sim = useSimulation();
  const replay = useStore((s) => s.simReplay);
  return (
    <div className="sim">
      {sim && reached && (
        <div className="sim__plate">
          <MonteCarloPaper
            paths={sim.sample_paths}
            states={sim.states.map((s) => ui.simulation.stateNames[s] ?? s)}
            bands={sim.summary.bands}
            totalFutures={sim.n_samples}
            laneSpacing={48}
            replay={replay}
            showReplay={false}
          />
        </div>
      )}
    </div>
  );
}

export function SimSummary() {
  const sim = useSimulation();
  if (!sim) return <div className="sim" />;
  const end = sim.dist[sim.horizon];
  const band = sim.summary.bands[sim.horizon];
  const lowUntil = sim.month_dates[sim.summary.low_risk_until_month];
  return (
    <div className="sim sim--summary">
      <div className="figure-block">
        <p
          className="figure figure--xl tabular"
          style={{ color: bandColor(band, sim.risk_bands) }}
        >
          {formatPercent(sim.summary.risk_at_horizon)}
        </p>
        <p className="quiet">
          {fill(ui.simulation.atHorizon, {
            date: formatISODate(sim.month_dates[sim.horizon]),
          })}
        </p>
      </div>

      {/* Where the futures end up: one bar, one segment per state. */}
      <div
        className="state-bar"
        role="img"
        aria-label={sim.states
          .map(
            (s, i) => `${ui.simulation.stateNames[s]} ${formatPercent(end[i])}`,
          )
          .join(", ")}
      >
        {sim.states.map((s, i) =>
          end[i] > 0 ? (
            <div
              key={s}
              className="state-bar__seg"
              style={{ flexGrow: end[i], background: stateColors[i] }}
              title={`${ui.simulation.stateNames[s]} ${formatPercent(end[i])}`}
            >
              {end[i] >= 0.08 && (
                <span className="state-bar__label">
                  {ui.simulation.stateNames[s]}{" "}
                  <span className="tabular">{formatPercent(end[i])}</span>
                </span>
              )}
            </div>
          ) : null,
        )}
      </div>

      {/* Risk band for each month, on the time axis. */}
      <div className="band-strip" aria-hidden="true">
        {sim.summary.bands.slice(1).map((b, m) => (
          <span key={m} style={{ background: bandColor(b, sim.risk_bands) }} />
        ))}
      </div>
      <p className="quiet">
        {fill(ui.simulation.lowRiskBand, { date: formatISODate(lowUntil) })}
      </p>

      <table className="sr-only">
        <caption>{ui.simulation.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{ui.simulation.date}</th>
            {sim.states.map((s) => (
              <th scope="col" key={s}>
                {ui.simulation.stateNames[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KEY_MONTHS.filter((m) => m <= sim.horizon).map((m) => (
            <tr key={m}>
              <th scope="row">{formatISODate(sim.month_dates[m])}</th>
              {sim.dist[m].map((p, i) => (
                <td key={i}>{formatPercent(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
