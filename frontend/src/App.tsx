import { useState } from "react";
import { Onboarding } from "./onboarding/Onboarding";
import { GlossaryScreen } from "./screens/GlossaryScreen";
import type { OnboardingResult } from "./types";
import {
  isInWaitingPeriod,
  planYearResetDate,
  formatDate,
} from "./lib/coverage";

type Plan = {
  maximum: number;
  used: number;
  deductible: number;
  coverage: number;
  excluded: boolean;
};
type Provider = {
  id: number;
  name: string;
  miles: number;
  network: boolean;
  fee: number;
  allowed: number;
};
const providers: Provider[] = [
  {
    id: 1,
    name: "Oak Street Dental",
    miles: 2.4,
    network: true,
    fee: 1400,
    allowed: 1400,
  },
  {
    id: 2,
    name: "Parkside Family Dentistry",
    miles: 4.8,
    network: true,
    fee: 1250,
    allowed: 1250,
  },
  {
    id: 3,
    name: "City Center Dental",
    miles: 3.1,
    network: false,
    fee: 1700,
    allowed: 1300,
  },
];
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
function estimate(p: Provider, plan: Plan) {
  const allowed = Math.min(p.fee, p.allowed);
  const deductible = Math.min(allowed, plan.deductible);
  const paid = plan.excluded
    ? 0
    : Math.min(
        Math.max(0, plan.maximum - plan.used),
        (Math.max(0, allowed - deductible) * plan.coverage) / 100,
      );
  return { paid, owed: p.fee - paid, deductible, balance: p.fee - allowed };
}
export default function App() {
  const [step, setStep] = useState(0);
  const [onboarding, setOnboarding] = useState<OnboardingResult | null>(null);
  const procedure = onboarding?.procedure.name ?? "";
  const procedureDescription = onboarding?.procedure.description ?? "";
  const zip = "sample area";
  const category = onboarding?.procedure.category ?? "major";
  const plan: Plan = {
    maximum: onboarding?.plan.annual_maximum ?? 1500,
    used: onboarding?.member.amount_used ?? 0,
    deductible:
      onboarding && onboarding.plan.deductible_applies_to.includes(category)
        ? Math.max(
            0,
            onboarding.plan.deductible - onboarding.member.deductible_met,
          )
        : 0,
    coverage: (onboarding?.plan.coinsurance[category] ?? 0.5) * 100,
    excluded: onboarding
      ? isInWaitingPeriod(onboarding.plan, onboarding.member, category)
      : false,
  };
  const [radius, setRadius] = useState(10);
  const [network, setNetwork] = useState(false);
  const [selected, setSelected] = useState<Provider | null>(null);
  const procedureProviders = providers.map((p) => ({
    ...p,
    fee: Math.round(
      (p.fee * (onboarding?.procedure.typical_fee ?? 1400)) / 1400,
    ),
    allowed: p.network
      ? Math.round((p.fee * (onboarding?.procedure.typical_fee ?? 1400)) / 1400)
      : (onboarding?.plan.out_of_network_allowed[
          onboarding.procedure.cdt_code
        ] ??
        Math.round(
          (p.allowed * (onboarding?.procedure.typical_fee ?? 1400)) / 1400,
        )),
  }));
  const remaining = Math.max(0, plan.maximum - plan.used);
  const result = selected ? estimate(selected, plan) : null;
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setStep(0);
          }}
        >
          ✦ ClearCare
        </a>
        <p>
          Your dental benefits,
          <br />
          made clear.
        </p>
        <nav aria-label="Main navigation">
          {[
            "Your details",
            "Find providers",
            "Care plan",
            "Understand your plan",
          ].map((label, i) => (
            <button
              key={label}
              className={step === i ? "active" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i > 0 && !onboarding ? 0 : i)}
            >
              <span>{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          CODELINC 11
          <br />
          <strong>Interactive demo</strong>
          <p>All plans and providers are fictional.</p>
        </div>
      </aside>
      <main>
        <header>
          <span>DENTAL BENEFITS OPTIMIZER</span>
          <span className="badge">Sample data</span>
        </header>
        <div hidden={step !== 0}>
          <Onboarding
            on_complete={(value) => {
              setOnboarding(value);
              setSelected(null);
              setStep(1);
            }}
          />
        </div>
        {step === 1 && (
          <>
            <h1>Find the right fit for your care.</h1>
            <p className="intro">
              Compare sample providers for your {procedure.toLowerCase()}. Your
              plan has {money(remaining)} left this year.
            </p>
            <div className="filters">
              <label>
                Within
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                >
                  <option value={3}>3 miles</option>
                  <option value={5}>5 miles</option>
                  <option value={10}>10 miles</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={network}
                  onChange={(e) => setNetwork(e.target.checked)}
                />
                In-network only
              </label>
              <span className="muted">Demo location: {zip}</span>
            </div>
            <div className="providers">
              {procedureProviders
                .filter((p) => p.miles <= radius && (!network || p.network))
                .sort((a, b) => estimate(a, plan).owed - estimate(b, plan).owed)
                .map((p) => (
                  <article className="card" key={p.id}>
                    <span className={"badge " + (!p.network ? "amber" : "")}>
                      {p.network ? "In-network" : "Out-of-network"}
                    </span>
                    <h2>{p.name}</h2>
                    <p className="muted">{p.miles} miles · Sample provider</p>
                    <p className="muted">Estimated you pay</p>
                    <div className="price">{money(estimate(p, plan).owed)}</div>
                    <p>
                      Procedure fee: {money(p.fee)}
                      <br />
                      Plan pays: {money(estimate(p, plan).paid)}
                    </p>
                    <button
                      className="primary"
                      onClick={() => {
                        setSelected(p);
                        setStep(2);
                      }}
                    >
                      Choose provider →
                    </button>
                  </article>
                ))}
            </div>
            <p className="muted">
              Estimates assume the procedure is covered, subject to waiting
              periods. Frequency limits and prior procedure history are not
              checked by this demo. Verify actual benefits and fees with your
              plan and dentist.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Your care, with the numbers explained.</h1>
            {!selected || !result ? (
              <div className="card">
                <p>Choose a provider to see your cost breakdown.</p>
                <button className="primary" onClick={() => setStep(1)}>
                  Find providers
                </button>
              </div>
            ) : (
              <>
                <p className="intro">
                  {procedure} at {selected.name}
                </p>
                {procedureDescription && (
                  <p className="notice">
                    Your description: {procedureDescription}
                  </p>
                )}
                <div className="grid">
                  <section className="card">
                    <h2>Estimated cost breakdown</h2>
                    <dl>
                      <dt>Provider fee</dt>
                      <dd>{money(selected.fee)}</dd>
                      <dt>Allowed amount</dt>
                      <dd>{money(selected.allowed)}</dd>
                      <dt>Deductible applied</dt>
                      <dd>{money(result.deductible)}</dd>
                      <dt>Balance-billing gap</dt>
                      <dd>{money(result.balance)}</dd>
                      <dt>Your plan pays</dt>
                      <dd>{money(result.paid)}</dd>
                      <dt className="total">You pay</dt>
                      <dd className="total">{money(result.owed)}</dd>
                    </dl>
                    {plan.excluded && (
                      <p className="notice">
                        This procedure is still within the sample plan’s waiting
                        period. Estimated plan payment is zero.
                      </p>
                    )}
                    <p className="notice">
                      Your plan pays {plan.coverage}% after the remaining
                      deductible, capped by your {money(remaining)} remaining
                      benefit.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Annual benefit tracker</h2>
                    <p>
                      {money(plan.used)} of {money(plan.maximum)} used
                    </p>
                    <progress
                      max={Math.max(1, plan.maximum)}
                      value={plan.used}
                    />
                    <h3>{money(remaining)} available</h3>
                    <p>
                      After this procedure:{" "}
                      {money(Math.max(0, remaining - result.paid))} remaining.
                    </p>
                    <div className="notice">
                      Sample plan resets{" "}
                      {onboarding
                        ? formatDate(planYearResetDate(onboarding.plan))
                        : "at the start of its next year"}
                      . Confirm your actual reset date and discuss treatment
                      timing with your dentist.
                    </div>
                  </section>
                </div>
                <section className="card">
                  <h2>Care timeline</h2>
                  <p>
                    <strong>1. Now:</strong> Confirm your provider’s quote and
                    coverage.
                  </p>
                  <p>
                    <strong>2. Before scheduling:</strong> Ask your dentist
                    about appropriate timing.
                  </p>
                  <p>
                    <strong>3. Before the plan resets:</strong> Review remaining
                    benefits and any outstanding recommended care.
                  </p>
                </section>
              </>
            )}
          </>
        )}
        {step === 3 && <GlossaryScreen />}
        <footer>
          Illustrative estimates · Confirm benefits before booking
        </footer>
      </main>
    </div>
  );
}
