// Simulation. The futures play on a fixed maroon stage (SimStage) once the
// narrator has said his intro line; the sim_intro stop itself is an empty
// screen to scroll to. SimSummary shows the numbers back on white.

import { useEffect } from "react";
import { stateColors } from "../design/tokens";
import { bandColor } from "../lib/risk";
import { formatISODate, formatPercent } from "../lib/coverage";
import { ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { prefersReducedMotion } from "../motion/config";
import { fresh, requestKey } from "../state/selectors";
import { useStore, type AppState } from "../state/store";
import { FuturesPlayback } from "../simulation/FuturesPlayback";
import { stage } from "../simulation/playbackConfig";
import type { ToothSimulation } from "../types";

const KEY_MONTHS = [0, 3, 6, 12, 18, 24];

function useSimulation(): ToothSimulation | null {
  return useStore((s) => fresh(s.simulation, requestKey(s)));
}

export function SimIntro() {
  return <div className="sim" />;
}

const patch = (p: Partial<AppState>) => useStore.getState().patch(p);

// The maroon stage. Runs idle → dark → playing → done while the sim_intro
// stop is current, and goes back to idle (fading to white) when it isn't.
export function SimStage() {
  const sim = useSimulation();
  const phase = useStore((s) => s.simStage);
  const onIntro = useStore((s) => s.currentStopId === "sim_intro");
  const introSaid = useStore((s) => s.lineDone === "sim_intro:sim_intro");
  const runId = useStore((s) => s.simReplay);
  const up = onIntro && phase !== "idle";

  useEffect(() => {
    if (!onIntro && phase !== "idle") patch({ simStage: "idle" });
  }, [onIntro, phase]);

  // Once the intro line has been said in full, darken the ground...
  useEffect(() => {
    if (!onIntro || !introSaid || !sim || phase !== "idle") return;
    const t = window.setTimeout(
      () => patch({ simStage: "dark" }),
      stage.afterLineMs,
    );
    return () => window.clearTimeout(t);
  }, [onIntro, introSaid, sim, phase]);

  // ...then play the futures.
  useEffect(() => {
    if (phase !== "dark") return;
    const t = window.setTimeout(
      () => patch({ simStage: "playing" }),
      prefersReducedMotion() ? 0 : stage.darkenMs,
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // The rest of the page restyles for the maroon ground (narration in
  // white, rail and meter out of the way).
  useEffect(() => {
    document.documentElement.toggleAttribute("data-stage", up);
    return () => document.documentElement.removeAttribute("data-stage");
  }, [up]);

  return (
    <div className="stage" data-up={up}>
      {sim && (
        <div className="stage__plot">
          <FuturesPlayback
            paths={sim.sample_paths}
            states={sim.states.map((s) => ui.simulation.stateNames[s] ?? s)}
            phase={phase}
            runId={runId}
            onDone={() => patch({ simStage: "done" })}
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
