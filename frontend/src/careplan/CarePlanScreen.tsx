import { useState } from "react";
import type {
  CarePlan,
  CarePlanOption,
  OnboardingResult,
  ProviderCard,
} from "../types";
import { isInWaitingPeriod, waitingPeriodEnds } from "../lib/coverage";
import { useExplanation } from "../hooks/useExplanation";
import { SegmentedBar } from "./shared";
import { dateLabel, day, money, percent } from "./format";
const same = (a: CarePlanOption, b: CarePlanOption) =>
  a.date === b.date && a.path === b.path;
const labelNames: Record<string, string> = {
  after_plan_reset: "After plan reset",
  waiting_period_ends: "Waiting period ends",
  fsa_deadline: "FSA deadline",
  today: "Current date",
};
const glossary: Record<string, string> = {
  Deductible: "An amount paid before the plan shares eligible costs.",
  Coinsurance: "The share of eligible costs paid by the member or plan.",
  "Annual maximum": "The most the dental plan pays during a benefit year.",
  "Balance billing":
    "The difference a provider may bill above the allowed amount.",
  "Waiting period":
    "An enrollment period before certain benefits become available.",
  "Frequency limit": "A limit on how often a service is covered.",
  "In-network": "A provider with a network contract.",
  "Out-of-network": "A provider without a network contract.",
};

export function CarePlanScreen({
  data,
  onboarding,
  provider,
}: {
  data: CarePlan;
  onboarding: OnboardingResult;
  provider: ProviderCard | undefined;
}) {
  const [term, setTerm] = useState("Deductible");
  const [showAll, setShowAll] = useState(true);
  const best = data.lowest_cost;
  const current = provider?.cost;
  const category = onboarding.procedure.category;
  const costExplanation = useExplanation(
    "/api/care-plan/explain",
    current
      ? JSON.stringify({
          cdt_code: onboarding.procedure.cdt_code,
          procedure: onboarding.procedure.name,
          provider: provider!.name,
          in_network: provider!.in_network,
          provider_fee: current.provider_fee,
          deductible_applied: current.deductible_applied,
          plan_pays: current.plan_pays,
          you_pay: current.you_pay,
          balance_billing: current.balance_billing,
          annual_maximum_remaining: current.annual_maximum_remaining,
        })
      : null,
  );
  const termExplanation = useExplanation(
    "/api/care-plan/terms/explain",
    JSON.stringify({
      term: term.toLowerCase(),
      context: {
        procedure: onboarding.procedure.name,
        category,
        annual_deductible: onboarding.plan.deductible,
        deductible_met: onboarding.member.deductible_met,
        deductible_applies:
          onboarding.plan.deductible_applies_to.includes(category),
        plan_share: onboarding.plan.coinsurance[category],
        annual_maximum: onboarding.plan.annual_maximum,
        amount_used: onboarding.member.amount_used,
        waiting_period_months: onboarding.plan.waiting_period_months[category],
        in_waiting_period: isInWaitingPeriod(
          onboarding.plan,
          onboarding.member,
          category,
        ),
        in_network: provider?.in_network ?? null,
        deductible_applied_to_estimate: current?.deductible_applied ?? null,
        balance_billing: current?.balance_billing ?? null,
      },
    }),
  );
  const wait = waitingPeriodEnds(onboarding.plan, onboarding.member, category);
  const waitIso = `${wait.getFullYear()}-${String(wait.getMonth() + 1).padStart(2, "0")}-${String(wait.getDate()).padStart(2, "0")}`;
  const markers = [
    ...data.maximum.map((m) => ({
      date: m.resets_on,
      label: "Plan-year reset",
    })),
    ...(data.fsa
      ? [{ date: data.fsa.spend_deadline, label: "FSA spending deadline" }]
      : []),
    { date: waitIso, label: "Waiting-period end" },
  ].filter((m) => day(m.date) >= day(data.as_of));
  const dates = [
    data.as_of,
    ...data.options.map((o) => o.date),
    ...markers.map((m) => m.date),
  ];
  const min = Math.min(...dates.map(day)),
    max = Math.max(min + 1, ...dates.map(day));
  const position = (date: string) =>
    40 + ((day(date) - min) / (max - min)) * 820;
  const scale = Math.max(1, ...Object.values(data.lever_savings).map(Math.abs));
  return (
    <div className="cp-plan">
      <div className="cp-heading">
        <div>
          <p className="cp-eyebrow">
            {onboarding.procedure.cdt_code} ·{" "}
            {provider?.name ?? data.provider_id}
          </p>
          <h1>Your care plan options.</h1>
        </div>
        <span className="cp-badge network">{data.tolerance} tolerance</span>
      </div>
      <p className="notice">
        Informational model estimates. Escalation rates are demo assumptions,
        not individualized clinical predictions. Timing decisions remain with
        the dentist.
      </p>
      <div className="cp-summary-grid">
        <section className="card">
          <p className="cp-eyebrow">Lowest-cost option in tolerance</p>
          <div className="price">{money(best.cost.mean)}</div>
          <p>
            {dateLabel(best.date)} · {best.path}
          </p>
          <p>
            Escalation probability:{" "}
            <strong>{percent(best.escalation_probability)}</strong>
          </p>
          <small>
            Selected by expected cost plus {data.tail_weight} × costliest-5%
            mean. Amount includes FSA / tax effects.
          </small>
        </section>
        <section className="card">
          <p className="cp-eyebrow">
            Savings against current-date insured baseline
          </p>
          <div className="price">{money(data.savings.mean)}</div>
          <p>
            5th–95th percentile:{" "}
            <strong>
              {money(data.savings.p5)} to {money(data.savings.p95)}
            </strong>
          </p>
          <p>
            Costs more in{" "}
            <strong>{percent(data.savings.probability_costs_more)}</strong> of
            simulated futures.
          </p>
          <small>
            Average savings can be negative. Percentiles describe simulated
            outcomes, not a guarantee.
          </small>
        </section>
      </div>
      <section className="card">
        <h2>Options across the plan year</h2>
        <p>
          Each marker is a priced date and payment path. Higher positions show
          more escalation risk.
        </p>
        <div className="cp-chart-scroll">
          <svg
            viewBox="0 0 900 245"
            role="img"
            aria-labelledby="risk-title risk-desc"
          >
            <title id="risk-title">Escalation risk by option date</title>
            <desc id="risk-desc">
              All dates, costs, payment paths and risk values appear in the
              option list below. Deadline dates are listed immediately below
              this chart.
            </desc>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line
                  x1="40"
                  x2="860"
                  y1={200 - v * 160}
                  y2={200 - v * 160}
                  stroke="#e0d9de"
                />
                <text x="0" y={204 - v * 160} fontSize="11">
                  {v * 100}%
                </text>
              </g>
            ))}
            {markers.map((m, i) => (
              <line
                key={`${m.date}-${i}`}
                x1={position(m.date)}
                x2={position(m.date)}
                y1="20"
                y2="210"
                stroke="#8d7181"
                strokeDasharray="4 5"
              />
            ))}
            {data.options.map((o) => (
              <circle
                key={`${o.date}-${o.path}`}
                cx={position(o.date) + (o.path === "cash" ? 3 : -3)}
                cy={200 - o.escalation_probability * 160}
                r={same(o, best) ? 8 : 4}
                fill={
                  same(o, best)
                    ? "#650030"
                    : data.beyond_tolerance && same(o, data.beyond_tolerance)
                      ? "#a65d09"
                      : "#6f8c83"
                }
              >
                <title>{`${dateLabel(o.date)}, ${o.path}, ${percent(o.escalation_probability)} risk, ${money(o.cost.mean)}`}</title>
              </circle>
            ))}
            <text x="40" y="235" fontSize="12">
              {dateLabel(data.as_of)}
            </text>
            <text x="860" y="235" textAnchor="end" fontSize="12">
              {dateLabel(dates.reduce((a, b) => (day(a) > day(b) ? a : b)))}
            </text>
          </svg>
        </div>
        <ul className="cp-marker-list">
          {markers.map((m, i) => (
            <li key={`${m.date}-${i}`}>
              <strong>{m.label}</strong> · {dateLabel(m.date)}
            </li>
          ))}
        </ul>
        <label className="cp-check">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />{" "}
          Show all options, including outside tolerance
        </label>
        <div className="cp-options">
          {data.options
            .filter(
              (o) =>
                showAll ||
                data.risk_bands.findIndex((b) => b.name === o.band) <=
                  data.risk_bands.findIndex((b) => b.name === data.tolerance),
            )
            .map((o) => (
              <article
                key={`${o.date}-${o.path}`}
                className={`cp-option ${same(o, best) ? "best" : ""} ${data.beyond_tolerance && same(o, data.beyond_tolerance) ? "riskier" : ""}`}
              >
                <div>
                  <strong>{dateLabel(o.date)}</strong>
                  <p>
                    {o.path} · {o.band} risk band
                  </p>
                  <small>
                    {o.labels
                      .map((l) => labelNames[l] ?? l.replaceAll("_", " "))
                      .join(" · ")}
                  </small>
                </div>
                <div>
                  <strong>{money(o.cost.mean)}</strong>
                  <p>
                    5–95% costs: {money(o.cost.p5)}–{money(o.cost.p95)}
                  </p>
                </div>
                <div>
                  <strong>
                    {percent(o.escalation_probability)} escalation
                  </strong>
                  <p>
                    {same(o, best)
                      ? "Lowest-cost option in tolerance"
                      : data.beyond_tolerance && same(o, data.beyond_tolerance)
                        ? "Cheaper, outside tolerance"
                        : "Priced alternative"}
                  </p>
                </div>
                <details>
                  <summary>Possible treatment outcomes</summary>
                  {o.outcomes.map((outcome, i) => (
                    <p key={i}>
                      {percent(outcome.probability)} ·{" "}
                      {outcome.visit.tooth_state.replaceAll("_", " ")} ·{" "}
                      {outcome.visit.lines
                        .map((l) => `${l.procedure_name} (${l.cdt_code})`)
                        .join(", ") || "No treatment line"}{" "}
                      · patient share {money(outcome.visit.you_pay)}
                    </p>
                  ))}
                </details>
              </article>
            ))}
        </div>
      </section>
      {data.beyond_tolerance && (
        <section className="card cp-risk-callout">
          <h2>Cheaper, with more escalation risk</h2>
          <p>
            {dateLabel(data.beyond_tolerance.date)} ·{" "}
            {data.beyond_tolerance.path} · average cost{" "}
            {money(data.beyond_tolerance.cost.mean)} · escalation probability{" "}
            {percent(data.beyond_tolerance.escalation_probability)}.
          </p>
          <p>
            This option falls outside {data.tolerance} tolerance. Additional
            average savings: {money(data.beyond_tolerance_savings?.mean ?? 0)}.
            The lower price is accompanied by higher modeled risk.
          </p>
        </section>
      )}
      <div className="cp-summary-grid">
        <section className="card">
          <h2>Annual maximum by plan year</h2>
          <p>
            Expected usage for the lowest-cost schedule, not booked
            appointments.
          </p>
          {data.maximum.map((m) => (
            <div className="cp-tracker" key={m.plan_year_start}>
              <h3>
                {dateLabel(m.plan_year_start)} – reset {dateLabel(m.resets_on)}
              </h3>
              <SegmentedBar
                label="Annual benefits"
                segments={[
                  { name: "Used", value: m.used, className: "used" },
                  {
                    name: "Scheduled",
                    value: m.scheduled,
                    className: "scheduled",
                  },
                  {
                    name: "Remaining",
                    value: m.remaining,
                    className: "remaining",
                  },
                ]}
              />
              <small>Annual maximum {money(m.annual_maximum)}</small>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>FSA balance and election</h2>
          {data.fsa ? (
            <>
              <p>
                Spending deadline:{" "}
                <strong>{dateLabel(data.fsa.spend_deadline)}</strong>
              </p>
              <SegmentedBar
                label="Current FSA balance allocation"
                segments={[
                  { name: "Spent", value: data.fsa.spent, className: "used" },
                  {
                    name: "Unused, retained",
                    value: Math.max(0, data.fsa.unused - data.fsa.forfeited),
                    className: "remaining",
                  },
                  {
                    name: "Forfeited",
                    value: data.fsa.forfeited,
                    className: "forfeited",
                  },
                ]}
              />
              <p>
                Total unused: {money(data.fsa.unused)}. Projected forfeiture is
                part of that unused amount.
              </p>
              <p>
                Next-year election modeled:{" "}
                <strong>
                  {onboarding.member.fsa &&
                  day(best.date) > day(onboarding.member.fsa.year_end)
                    ? money(data.fsa.election)
                    : "No future-year election modeled for this option"}
                </strong>
              </p>
              <p>Carryover limit: {money(data.fsa.carryover_limit)}</p>
              <small>
                Expected values for this schedule; election is not submitted by
                this app.
              </small>
            </>
          ) : (
            <p>No FSA data is associated with this member.</p>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Where the savings come from</h2>
        <p>Average contribution of each lever, accounting for interactions.</p>
        <div
          role="img"
          aria-label={Object.entries(data.lever_savings)
            .map(([k, v]) => `${k.replaceAll("_", " ")}: ${money(v)}`)
            .join("; ")}
        >
          {Object.entries(data.lever_savings).map(([k, v]) => (
            <div className="cp-lever" key={k}>
              <span>{k.replaceAll("_", " ")}</span>
              <div className="cp-lever-track">
                <span
                  className={v < 0 ? "negative" : ""}
                  style={{ width: `${(Math.abs(v) / scale) * 100}%` }}
                />
              </div>
              <strong>{money(v)}</strong>
            </div>
          ))}
        </div>
        <p className="muted">
          Negative amounts increase costs. Lever amounts are savings
          contributions, not fees.
        </p>
      </section>
      <section>
        <h2>Dates and balances</h2>
        <p className="muted">
          Countdowns use the model’s balance date, {dateLabel(data.as_of)}.
          These are on-screen reminders.
        </p>
        <div className="cp-reminders">
          {data.reminders.length ? (
            data.reminders.map((r, i) => {
              const days = day(r.deadline) - day(data.as_of);
              return (
                <article className="card" key={i}>
                  <span className="cp-countdown">
                    {days < 0
                      ? `${-days} days past`
                      : days === 0
                        ? "Due on balance date"
                        : `${days} days`}
                  </span>
                  <h3>
                    {r.kind === "annual_maximum_expires"
                      ? "Annual benefits expiry"
                      : r.kind === "fsa_forfeited"
                        ? "FSA spending deadline"
                        : "Cleaning coverage date"}
                  </h3>
                  <p>{dateLabel(r.deadline)}</p>
                  <strong>{money(r.amount)}</strong>
                  <p>
                    {r.kind === "annual_maximum_expires"
                      ? "Projected unused annual benefits at reset."
                      : r.kind === "fsa_forfeited"
                        ? "Projected balance forfeited at the spending deadline."
                        : "A cleaning has an estimated covered benefit on this date; eligibility remains subject to plan rules."}
                  </p>
                </article>
              );
            })
          ) : (
            <div className="card">
              No deadline reminders returned for this schedule.
            </div>
          )}
        </div>
      </section>
      <section className="card">
        <h2>Current-date estimate explained</h2>
        <p className="muted">
          This explanation describes today’s insured quote, not a simulated
          future schedule.
        </p>
        {costExplanation.loading && <p role="status">Loading explanation…</p>}
        {costExplanation.error && (
          <p role="alert">
            {costExplanation.error} Numeric results remain available above.
          </p>
        )}
        {costExplanation.text && (
          <p className="cp-text">{costExplanation.text}</p>
        )}
        {!current && <p>Current-date quote unavailable.</p>}
      </section>
      <section className="card">
        <h2>Understand your plan</h2>
        <label>
          Insurance term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {Object.keys(glossary).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div aria-live="polite">
          {termExplanation.loading && <p>Explaining this term…</p>}
          {termExplanation.error && (
            <>
              <p role="alert">{termExplanation.error}</p>
              <p>{glossary[term]}</p>
            </>
          )}
          {termExplanation.text && (
            <p className="cp-text">{termExplanation.text}</p>
          )}
        </div>
        <small>
          Plan facts use current-date data; definitions are AI-generated when
          the explanation service is available.
        </small>
      </section>
      <details className="card">
        <summary>Model assumptions and limitations</summary>
        <ul>
          {data.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
