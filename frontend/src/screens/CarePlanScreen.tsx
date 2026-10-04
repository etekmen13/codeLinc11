import { fetch_care_plan, type OnboardingRequest } from "../api";
import {
  formatISODate,
  formatMoney,
  formatMoneyCents,
  formatPercent,
} from "../lib/coverage";
import {
  band_label,
  DENIAL_REASONS,
  lever_label,
  option_labels,
  PAYMENT_PATHS,
  REMINDER_KINDS,
  tooth_state_label,
} from "../lib/labels";
import { useApi } from "../lib/useApi";
import type {
  CarePlan,
  CarePlanOption,
  FsaTracker,
  MaximumUsage,
  RiskBand,
  Savings,
} from "../types";
import type { ChosenDentist } from "./CompareScreen";
import { Status } from "./Status";

interface Props {
  request: OnboardingRequest;
  procedure: string; // its name
  dentist: ChosenDentist;
  tolerance: string | null; // the same tolerance as the comparison
  on_back: () => void;
}

// The full set of options for the chosen dentist, and the lowest-cost one
// within the risk tolerance in detail.
export function CarePlanScreen({
  request,
  procedure,
  dentist,
  tolerance,
  on_back,
}: Props) {
  const fetched = useApi(fetch_care_plan, {
    ...request,
    provider_id: dentist.provider_id,
    risk_tolerance: tolerance ?? undefined,
  });
  const plan = fetched.data;

  return (
    <>
      <h1>
        {procedure} at {dentist.name}: your options.
      </h1>
      <Status fetched={fetched} what="the care plan" />
      {plan && <Plan plan={plan} />}
      <button type="button" className="secondary" onClick={on_back}>
        ← Compare dentists
      </button>
    </>
  );
}

function Plan({ plan }: { plan: CarePlan }) {
  const best = plan.lowest_cost;
  const bands = plan.risk_bands;
  return (
    <>
      <p className="intro">
        The option with the lowest expected cost within{" "}
        {band_label(plan.tolerance, bands).toLowerCase()} risk, compared with
        having it on the earliest date through insurance. Amounts are averages
        over simulated futures for your tooth.
      </p>

      <div className="grid">
        <section className="card">
          <h2>Lowest-cost option within your risk tolerance</h2>
          <div className="price">{formatMoney(best.cost.mean)}</div>
          <p className="muted">
            Expected cost after FSA money and its tax savings.
          </p>
          <OptionFacts option={best} bands={bands} />
        </section>
        <section className="card">
          <h2>Compared with the earliest date</h2>
          <SavingsFacts
            savings={plan.savings}
            baseline={plan.baseline}
            versus="the earliest date through insurance"
          />
        </section>
      </div>

      <section className="card">
        <h2>What the visit would cost, line by line</h2>
        <Breakdown option={best} />
      </section>

      {plan.beyond_tolerance && plan.beyond_tolerance_savings && (
        <section className="card">
          <h2>A cheaper option at higher risk</h2>
          <p className="notice">
            Outside your risk tolerance,{" "}
            {formatISODate(plan.beyond_tolerance.date)} (
            {band_label(plan.beyond_tolerance.band, bands).toLowerCase()} risk)
            has a lower expected cost:{" "}
            {formatMoney(plan.beyond_tolerance.cost.mean)}.
          </p>
          <SavingsFacts
            savings={plan.beyond_tolerance_savings}
            baseline={best}
            versus="the option above"
          />
        </section>
      )}

      <section className="card">
        <h2>Where the savings come from</h2>
        <dl>
          {Object.entries(plan.lever_savings).map(([lever, amount]) => (
            <LeverRow key={lever} lever={lever} amount={amount} />
          ))}
          <dt className="total">Total</dt>
          <dd className="total">{formatMoney(plan.savings.mean)}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Every option priced</h2>
        <OptionsTable plan={plan} />
      </section>

      <div className="grid">
        {plan.maximum.map((m) => (
          <MaximumCard key={m.plan_year_start} usage={m} />
        ))}
        {plan.fsa && <FsaCard fsa={plan.fsa} />}
      </div>

      {plan.reminders.length > 0 && (
        <section className="card">
          <h2>Benefits that expire unused</h2>
          {plan.reminders.map((r) => (
            <div className="notice" key={r.kind}>
              <strong>{REMINDER_KINDS[r.kind]}</strong> ·{" "}
              {formatMoney(r.amount)} · until {formatISODate(r.deadline)}
              <p>{r.message}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Assumptions</h2>
        <ul className="muted">
          {plan.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function OptionFacts({
  option,
  bands,
}: {
  option: CarePlanOption;
  bands: RiskBand[];
}) {
  return (
    <dl>
      <dt>Date</dt>
      <dd>{formatISODate(option.date)}</dd>
      <dt>Why this date</dt>
      <dd>{option_labels(option.labels)}</dd>
      <dt>Paid</dt>
      <dd>{PAYMENT_PATHS[option.path]}</dd>
      <dt>Chance the tooth is worse by then</dt>
      <dd>
        {formatPercent(option.escalation_probability)} (
        {band_label(option.band, bands).toLowerCase()})
      </dd>
      <dt>Cost range (5% to 95% of futures)</dt>
      <dd>
        {formatMoney(option.cost.p5)} to {formatMoney(option.cost.p95)}
      </dd>
      <dt>Owed to dentists, before FSA</dt>
      <dd>{formatMoney(option.member_share.mean)}</dd>
    </dl>
  );
}

function SavingsFacts({
  savings,
  baseline,
  versus,
}: {
  savings: Savings;
  baseline: CarePlanOption;
  versus: string;
}) {
  return (
    <dl>
      <dt>
        {formatISODate(baseline.date)},{" "}
        {PAYMENT_PATHS[baseline.path].toLowerCase()}
      </dt>
      <dd>{formatMoney(baseline.cost.mean)}</dd>
      <dt>Average saving versus {versus}</dt>
      <dd>{formatMoney(savings.mean)}</dd>
      <dt>Saving range (5% to 95% of futures)</dt>
      <dd>
        {formatMoney(savings.p5)} to {formatMoney(savings.p95)}
      </dd>
      <dt>How often it costs more</dt>
      <dd>{formatPercent(savings.probability_costs_more)} of futures</dd>
    </dl>
  );
}

function Breakdown({ option }: { option: CarePlanOption }) {
  return (
    <>
      {option.outcomes.map((outcome) => (
        <div className="risk-table-wrap" key={outcome.visit.tooth_state}>
          <table className="risk-table">
            <caption>
              {tooth_state_label(outcome.visit.tooth_state)} on{" "}
              {formatISODate(outcome.visit.date)}:{" "}
              {formatPercent(outcome.probability)} of futures
            </caption>
            <thead>
              <tr>
                <th scope="col">Procedure</th>
                <th scope="col">Fee</th>
                <th scope="col">Allowed</th>
                <th scope="col">Deductible</th>
                <th scope="col">Balance bill</th>
                <th scope="col">Plan pays</th>
                <th scope="col">You pay</th>
                <th scope="col">Not covered because</th>
              </tr>
            </thead>
            <tbody>
              {outcome.visit.lines.length === 0 && (
                <tr>
                  <td colSpan={8}>Nothing to bill.</td>
                </tr>
              )}
              {outcome.visit.lines.map((line) => (
                <tr key={line.cdt_code}>
                  <th scope="row">
                    {line.procedure_name}
                    <br />
                    <span className="muted">
                      {line.provider_name} ·{" "}
                      {line.in_network ? "in-network" : "out-of-network"} ·{" "}
                      {PAYMENT_PATHS[line.path].toLowerCase()}
                    </span>
                  </th>
                  <td>{formatMoneyCents(line.provider_fee)}</td>
                  <td>{formatMoneyCents(line.allowed_amount)}</td>
                  <td>{formatMoneyCents(line.deductible_applied)}</td>
                  <td>{formatMoneyCents(line.balance_billing)}</td>
                  <td>{formatMoneyCents(line.plan_pays)}</td>
                  <td>{formatMoneyCents(line.you_pay)}</td>
                  <td>
                    {line.denial_reason
                      ? DENIAL_REASONS[line.denial_reason]
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function LeverRow({ lever, amount }: { lever: string; amount: number }) {
  return (
    <>
      <dt>{lever_label(lever)}</dt>
      <dd>{formatMoney(amount)}</dd>
    </>
  );
}

function OptionsTable({ plan }: { plan: CarePlan }) {
  const is = (a: CarePlanOption, b: CarePlanOption) =>
    a.date === b.date && a.path === b.path;
  return (
    <div className="risk-table-wrap">
      <table className="risk-table">
        <caption>
          Every date and payment method considered, in date order
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Why this date</th>
            <th scope="col">Paid</th>
            <th scope="col">Risk</th>
            <th scope="col">Expected cost</th>
            <th scope="col">5% to 95%</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {plan.options.map((x) => (
            <tr key={`${x.date} ${x.path}`}>
              <th scope="row">{formatISODate(x.date)}</th>
              <td>{option_labels(x.labels)}</td>
              <td>{PAYMENT_PATHS[x.path]}</td>
              <td>
                {formatPercent(x.escalation_probability)} (
                {band_label(x.band, plan.risk_bands).toLowerCase()})
              </td>
              <td>{formatMoney(x.cost.mean)}</td>
              <td>
                {formatMoney(x.cost.p5)} to {formatMoney(x.cost.p95)}
              </td>
              <td>
                {is(x, plan.lowest_cost) && "Lowest cost within tolerance. "}
                {is(x, plan.baseline) && "Earliest date. "}
                {plan.beyond_tolerance &&
                  is(x, plan.beyond_tolerance) &&
                  "Lowest cost overall."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaximumCard({ usage: m }: { usage: MaximumUsage }) {
  return (
    <section className="card">
      <h2>Annual maximum, plan year from {formatISODate(m.plan_year_start)}</h2>
      <p>
        {formatMoney(m.used + m.scheduled)} of {formatMoney(m.annual_maximum)}{" "}
        used with this visit
      </p>
      <progress
        max={Math.max(1, m.annual_maximum)}
        value={m.used + m.scheduled}
      />
      <dl>
        <dt>Used before the visit</dt>
        <dd>{formatMoney(m.used)}</dd>
        <dt>This visit (expected)</dt>
        <dd>{formatMoney(m.scheduled)}</dd>
        <dt>Remaining</dt>
        <dd>{formatMoney(m.remaining)}</dd>
        <dt>Resets on</dt>
        <dd>{formatISODate(m.resets_on)}</dd>
      </dl>
    </section>
  );
}

function FsaCard({ fsa }: { fsa: FsaTracker }) {
  return (
    <section className="card">
      <h2>FSA</h2>
      <p>
        {formatMoney(fsa.spent)} of this year's {formatMoney(fsa.balance)}{" "}
        balance spent on this visit
      </p>
      <progress max={Math.max(1, fsa.balance)} value={fsa.spent} />
      <dl>
        <dt>Unused</dt>
        <dd>{formatMoney(fsa.unused)}</dd>
        <dt>Forfeited after {formatISODate(fsa.spend_deadline)}</dt>
        <dd>{formatMoney(fsa.forfeited)}</dd>
        <dt>Carryover limit</dt>
        <dd>{formatMoney(fsa.carryover_limit)}</dd>
        {fsa.election > 0 && (
          <>
            <dt>Next year's election with the lowest expected cost</dt>
            <dd>{formatMoney(fsa.election)}</dd>
          </>
        )}
      </dl>
      {fsa.election > 0 && (
        <p className="muted">
          Each elected dollar saves {formatPercent(fsa.election_quantile)} in
          tax if it is spent on the visit and is forfeited if it is not. This
          amount balances the two across the simulated futures.
        </p>
      )}
    </section>
  );
}
