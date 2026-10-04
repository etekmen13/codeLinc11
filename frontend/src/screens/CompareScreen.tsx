import { fetch_care_comparison, type OnboardingRequest } from "../api";
import { formatISODate, formatMoney } from "../lib/coverage";
import { band_label, PAYMENT_PATHS } from "../lib/labels";
import {
  expected_balance_bill,
  expected_plan_pays,
  fsa_used,
} from "../lib/options";
import { useApi } from "../lib/useApi";
import type { DentistOption } from "../types";
import { Status } from "./Status";

const RADIUS_MILES = [3, 5, 10, 25];

export interface ChosenDentist {
  provider_id: string;
  name: string;
}

interface Props {
  request: OnboardingRequest;
  tolerance: string | null; // null: the backend's default, the lowest band
  on_tolerance: (tolerance: string) => void;
  radius: number;
  on_radius: (miles: number) => void;
  in_network_only: boolean;
  on_in_network_only: (only: boolean) => void;
  on_choose: (dentist: ChosenDentist) => void;
}

// Every nearby dentist, each priced on their own lowest-cost option within
// the risk tolerance.
export function CompareScreen(props: Props) {
  const { request, tolerance, radius, in_network_only } = props;
  const fetched = useApi(fetch_care_comparison, {
    ...request,
    risk_tolerance: tolerance ?? undefined,
    radius_miles: radius,
  });
  // The tolerance choices come from a response; keep them while reloading.
  const bands = fetched.latest?.risk_bands;
  const c = fetched.data;

  return (
    <>
      <h1>Compare dentists on their lowest-cost options.</h1>
      <p className="intro">
        Each dentist is priced on the date and payment method with the lowest
        expected cost within your risk tolerance, across the same simulated
        futures for your tooth. Amounts are averages over those futures.
      </p>
      <div className="filters">
        {bands && (
          <label>
            Risk tolerance
            <select
              value={tolerance ?? bands[0].name}
              onChange={(e) => props.on_tolerance(e.target.value)}
            >
              {bands.map((b) => (
                <option key={b.name} value={b.name}>
                  {band_label(b.name, bands)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Within
          <select
            value={radius}
            onChange={(e) => props.on_radius(Number(e.target.value))}
          >
            {RADIUS_MILES.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={in_network_only}
            onChange={(e) => props.on_in_network_only(e.target.checked)}
          />
          In-network only
        </label>
      </div>

      <Status fetched={fetched} what="the dentist comparison" />
      {c && (
        <>
          <div className="grid">
            <Column
              title="In-network"
              dentists={c.in_network}
              radius={radius}
              on_choose={props.on_choose}
            />
            {!in_network_only && (
              <Column
                title="Out-of-network"
                dentists={c.out_of_network}
                radius={radius}
                on_choose={props.on_choose}
              />
            )}
          </div>
          <ul className="muted">
            {c.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Column({
  title,
  dentists,
  radius,
  on_choose,
}: {
  title: string;
  dentists: DentistOption[];
  radius: number;
  on_choose: (dentist: ChosenDentist) => void;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {dentists.length === 0 && (
        <p className="muted">
          No {title.toLowerCase()} dentists within {radius} miles do this
          procedure.
        </p>
      )}
      {dentists.map((d) => (
        <DentistCard key={d.provider_id} dentist={d} on_choose={on_choose} />
      ))}
    </section>
  );
}

function DentistCard({
  dentist: d,
  on_choose,
}: {
  dentist: DentistOption;
  on_choose: (dentist: ChosenDentist) => void;
}) {
  const best = d.lowest_cost;
  return (
    <article className="card">
      <span className={d.in_network ? "badge" : "badge amber"}>
        {d.in_network ? "In-network" : "Out-of-network"}
      </span>
      <h2>{d.name}</h2>
      <p className="muted">
        {d.distance_miles} miles
        {d.credentials.length > 0 && <> · {d.credentials.join(", ")}</>}
      </p>
      <p className="muted">Expected cost of the lowest-cost option</p>
      <div className="price">{formatMoney(best.cost.mean)}</div>
      <p className="muted">After FSA money and its tax savings.</p>
      <dl>
        <dt>Date</dt>
        <dd>{formatISODate(best.date)}</dd>
        <dt>Paid</dt>
        <dd>{PAYMENT_PATHS[best.path]}</dd>
        <dt>Plan pays</dt>
        <dd>{formatMoney(expected_plan_pays(best))}</dd>
        <dt>Balance bill</dt>
        <dd>{formatMoney(expected_balance_bill(best))}</dd>
        <dt>FSA used</dt>
        <dd>{formatMoney(fsa_used(best))}</dd>
        <dt>
          On {formatISODate(d.baseline.date)},{" "}
          {PAYMENT_PATHS[d.baseline.path].toLowerCase()}
        </dt>
        <dd>{formatMoney(d.baseline.cost.mean)}</dd>
      </dl>
      <button
        type="button"
        className="primary"
        onClick={() => on_choose({ provider_id: d.provider_id, name: d.name })}
      >
        See the care plan →
      </button>
    </article>
  );
}
