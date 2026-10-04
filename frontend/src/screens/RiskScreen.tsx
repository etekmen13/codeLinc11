import { fetch_simulation, type OnboardingRequest } from "../api";
import { formatISODate, formatPercent } from "../lib/coverage";
import { band_label, tooth_state_label } from "../lib/labels";
import { useApi } from "../lib/useApi";
import { Status } from "./Status";

// Months shown in the table, if within the horizon.
const KEY_MONTHS = [0, 3, 6, 12, 18, 24];

// How the untreated tooth may progress. A plain table for now; the chart
// will replace it.
export function RiskScreen({
  request,
  on_next,
}: {
  request: OnboardingRequest;
  on_next: () => void;
}) {
  const fetched = useApi(fetch_simulation, request);
  const sim = fetched.data;

  return (
    <>
      <h1>How the tooth may change over time.</h1>
      <Status fetched={fetched} what="the tooth simulation" />
      {sim && (
        <>
          <p className="intro">
            If the tooth is left as it is, these are the chances of each
            condition over the next {sim.horizon} months, across{" "}
            {sim.n_samples.toLocaleString()} simulated futures starting from{" "}
            {tooth_state_label(sim.start_state).toLowerCase()} on{" "}
            {formatISODate(sim.as_of)}.
          </p>

          <section className="card">
            <h2>
              Low risk until{" "}
              {formatISODate(sim.month_dates[sim.summary.low_risk_until_month])}
            </h2>
            <p>
              Risk is the chance the tooth is worse than it is now. It is{" "}
              {formatPercent(sim.summary.risk_at_low_risk_until)} by then, and{" "}
              {formatPercent(sim.summary.risk_at_horizon)} by{" "}
              {formatISODate(sim.month_dates[sim.horizon])}.
            </p>
            <dl>
              {sim.summary.band_segments.map((s) => (
                <BandRun
                  key={s.start_month}
                  label={band_label(s.band, sim.risk_bands)}
                  from={sim.month_dates[s.start_month]}
                  to={sim.month_dates[s.end_month]}
                />
              ))}
            </dl>
          </section>

          <section className="card">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <caption>Chance of each condition, by date</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {sim.states.map((s) => (
                      <th scope="col" key={s}>
                        {tooth_state_label(s)}
                      </th>
                    ))}
                    <th scope="col">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {KEY_MONTHS.filter((m) => m <= sim.horizon).map((m) => (
                    <tr key={m}>
                      <th scope="row">{formatISODate(sim.month_dates[m])}</th>
                      {sim.dist[m].map((p, i) => (
                        <td key={sim.states[i]}>{formatPercent(p)}</td>
                      ))}
                      <td>
                        {band_label(sim.summary.bands[m], sim.risk_bands)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>On {formatISODate(sim.month_dates[sim.horizon])}</h2>
            <div className="risk-distribution">
              {sim.states.map((s, i) => (
                <div key={s}>
                  <span>{tooth_state_label(s)}</span>
                  <progress max={1} value={sim.dist[sim.horizon][i]} />
                  <span>{formatPercent(sim.dist[sim.horizon][i])}</span>
                </div>
              ))}
            </div>
          </section>

          <p className="muted">
            Progression rates are placeholders, not clinically calibrated. This
            describes chances; timing decisions belong to you and your dentist.
          </p>
          <button type="button" className="primary" onClick={on_next}>
            Compare dentists →
          </button>
        </>
      )}
    </>
  );
}

function BandRun({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {formatISODate(from)}
        {from !== to && <> to {formatISODate(to)}</>}
      </dd>
    </>
  );
}
