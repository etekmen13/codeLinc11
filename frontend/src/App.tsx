import { useEffect, useState } from "react";
import {
  formatDate,
  isInWaitingPeriod,
  planYearResetDate,
} from "./lib/coverage";
import { Onboarding } from "./onboarding/Onboarding";
import type { OnboardingResult } from "./types";

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

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

function estimate(provider: Provider, plan: Plan) {
  const allowed = Math.min(provider.fee, provider.allowed);
  const deductible = plan.excluded ? 0 : Math.min(allowed, plan.deductible);

  const paid = plan.excluded
    ? 0
    : Math.min(
        Math.max(0, plan.maximum - plan.used),
        (Math.max(0, allowed - deductible) * plan.coverage) / 100,
      );

  return {
    allowed,
    paid,
    owed: provider.fee - paid,
    deductible,
    balance: provider.fee - allowed,
  };
}

const glossary: Record<string, string> = {
  Deductible:
    "The amount you pay for services subject to a deductible before the plan starts sharing eligible costs.",
  Coinsurance:
    "The percentage of eligible costs you or your plan pays, subject to other plan rules.",
  "Annual maximum":
    "The most your dental plan pays during a benefit year for services subject to this limit.",
  "Balance billing":
    "The difference a provider may bill between its fee and the insurer’s allowed amount.",
  "Allowed amount":
    "The amount the insurer recognizes when calculating benefits. It is not necessarily the plan’s payment.",
  "In-network":
    "A provider with a contract with the relevant insurer or network.",
  "Out-of-network":
    "A provider without a contract with the relevant insurer or network.",
  "Waiting period":
    "An enrollment period that must pass before certain benefits become available.",
  "Frequency limit":
    "A restriction on how often a service is covered within a specified period.",
  Premium:
    "The recurring payment to maintain insurance coverage, separate from treatment charges.",
};

type ExplanationState = {
  text: string;
  loading: boolean;
  error: string;
};

function useExplanation(path: string, body: string | null) {
  const [state, setState] = useState<ExplanationState>({
    text: "",
    loading: false,
    error: "",
  });

  useEffect(() => {
    if (body === null) {
      setState({ text: "", loading: false, error: "" });
      return;
    }

    const controller = new AbortController();
    setState({ text: "", loading: true, error: "" });

    async function fetchExplanation() {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Unable to load the explanation (HTTP ${response.status}). Check the backend terminal for details.`,
          );
        }

        const data: unknown = await response.json();

        if (
          !data ||
          typeof data !== "object" ||
          !("explanation" in data) ||
          typeof data.explanation !== "string"
        ) {
          throw new Error("The backend returned an invalid explanation.");
        }

        if (!controller.signal.aborted) {
          setState({
            text: data.explanation,
            loading: false,
            error: "",
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            text: "",
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load the explanation.",
          });
        }
      }
    }

    void fetchExplanation();
    return () => controller.abort();
  }, [path, body]);

  return state;
}

export default function App() {
  const [step, setStep] = useState(0);
  const [onboarding, setOnboarding] = useState<OnboardingResult | null>(null);
  const [radius, setRadius] = useState(10);
  const [network, setNetwork] = useState(false);
  const [selected, setSelected] = useState<Provider | null>(null);
  const [term, setTerm] = useState("Deductible");

  const procedure = onboarding?.procedure.name ?? "";
  const procedureDescription = onboarding?.procedure.description ?? "";
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

  const procedureProviders = providers.map((provider) => ({
    ...provider,
    fee: Math.round(
      (provider.fee * (onboarding?.procedure.typical_fee ?? 1400)) / 1400,
    ),
    allowed: provider.network
      ? Math.round(
          (provider.fee * (onboarding?.procedure.typical_fee ?? 1400)) / 1400,
        )
      : (onboarding?.plan.out_of_network_allowed[
          onboarding.procedure.cdt_code
        ] ??
        Math.round(
          (provider.allowed * (onboarding?.procedure.typical_fee ?? 1400)) /
            1400,
        )),
  }));

  const remaining = Math.max(0, plan.maximum - plan.used);
  const result = selected ? estimate(selected, plan) : null;

  const costExplanation = useExplanation(
    "/api/care-plan/explain",
    step === 2 && onboarding && selected && result
      ? JSON.stringify({
          procedure,
          provider: selected.name,
          in_network: selected.network,
          provider_fee: selected.fee,
          deductible_applied: result.deductible,
          plan_pays: result.paid,
          you_pay: result.owed,
          balance_billing: result.balance,
          annual_maximum_remaining: Math.max(0, remaining - result.paid),
          cdt_code: onboarding.procedure.cdt_code,
        })
      : null,
  );

  const termExplanation = useExplanation(
    "/api/care-plan/terms/explain",
    step === 3 && onboarding
      ? JSON.stringify({
          term: term.toLowerCase(),
          context: {
            procedure,
            category,
            annual_deductible: onboarding.plan.deductible,
            deductible_met: onboarding.member.deductible_met,
            deductible_applies:
              onboarding.plan.deductible_applies_to.includes(category),
            plan_share: onboarding.plan.coinsurance[category],
            annual_maximum: onboarding.plan.annual_maximum,
            amount_used: onboarding.member.amount_used,
            waiting_period_months:
              onboarding.plan.waiting_period_months[category],
            in_waiting_period: plan.excluded,
            in_network: selected?.network ?? null,
            deductible_applied_to_estimate: result?.deductible ?? null,
            balance_billing: result?.balance ?? null,
          },
        })
      : null,
  );

  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
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
          ].map((label, index) => (
            <button
              key={label}
              className={step === index ? "active" : ""}
              aria-current={step === index ? "step" : undefined}
              onClick={() => setStep(index > 0 && !onboarding ? 0 : index)}
            >
              <span>{index + 1}</span>
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
                  onChange={(event) => setRadius(Number(event.target.value))}
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
                  onChange={(event) => setNetwork(event.target.checked)}
                />
                In-network only
              </label>
              <span className="muted">Demo location: sample area</span>
            </div>

            <div className="providers">
              {procedureProviders
                .filter(
                  (provider) =>
                    provider.miles <= radius && (!network || provider.network),
                )
                .sort((a, b) => estimate(a, plan).owed - estimate(b, plan).owed)
                .map((provider) => (
                  <article className="card" key={provider.id}>
                    <span
                      className={"badge " + (!provider.network ? "amber" : "")}
                    >
                      {provider.network ? "In-network" : "Out-of-network"}
                    </span>
                    <h2>{provider.name}</h2>
                    <p className="muted">
                      {provider.miles} miles · Sample provider
                    </p>
                    <p className="muted">Estimated you pay</p>
                    <div className="price">
                      {money(estimate(provider, plan).owed)}
                    </div>
                    <p>
                      Procedure fee: {money(provider.fee)}
                      <br />
                      Plan pays: {money(estimate(provider, plan).paid)}
                    </p>
                    <button
                      className="primary"
                      onClick={() => {
                        setSelected(provider);
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
                <p>
                  CDT code: <strong>{onboarding?.procedure.cdt_code}</strong>
                </p>
                {procedureDescription && (
                  <p className="notice">
                    Procedure description: {procedureDescription}
                  </p>
                )}

                <div className="grid">
                  <section className="card">
                    <h2>Estimated cost breakdown</h2>
                    <dl>
                      <dt>Provider fee</dt>
                      <dd>{money(selected.fee)}</dd>
                      <dt>Allowed amount</dt>
                      <dd>{money(result.allowed)}</dd>
                      <dt>Deductible applied</dt>
                      <dd>{money(result.deductible)}</dd>
                      <dt>Balance-billing gap</dt>
                      <dd>{money(result.balance)}</dd>
                      <dt>Your plan pays</dt>
                      <dd>{money(result.paid)}</dd>
                      <dt className="total">You pay</dt>
                      <dd className="total">{money(result.owed)}</dd>
                    </dl>

                    {plan.excluded ? (
                      <p className="notice">
                        This procedure is within the sample plan’s waiting
                        period. Estimated plan payment is zero.
                      </p>
                    ) : (
                      <p className="notice">
                        Your plan lists a {plan.coverage}% share after any
                        applicable deductible, capped by your {money(remaining)}{" "}
                        remaining benefit.
                      </p>
                    )}
                  </section>

                  <section className="card" aria-live="polite">
                    <h2>Your estimate explained</h2>
                    {costExplanation.loading && (
                      <p>Loading your explanation…</p>
                    )}
                    {costExplanation.error && (
                      <p role="alert">{costExplanation.error}</p>
                    )}
                    {costExplanation.text && (
                      <p style={{ whiteSpace: "pre-line" }}>
                        {costExplanation.text}
                      </p>
                    )}
                  </section>

                  <section className="card">
                    <h2>Annual benefit tracker</h2>
                    <p>
                      {money(plan.used)} of {money(plan.maximum)} used
                    </p>
                    <progress
                      aria-label="Annual benefits used"
                      max={Math.max(1, plan.maximum)}
                      value={Math.min(plan.used, plan.maximum)}
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
                      . Confirm your actual reset date with your insurer.
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
                    benefits and outstanding recommended care.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1>Insurance language, in plain English.</h1>
            <p className="intro">
              Understand the terms behind your estimate for {procedure}.
            </p>

            <section className="card">
              <label>
                Choose a term
                <select
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                >
                  {Object.keys(glossary).map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="translation" aria-live="polite">
                <h2>{term}</h2>
                {termExplanation.loading && <p>Explaining this term…</p>}
                {termExplanation.error && (
                  <>
                    <p role="alert">{termExplanation.error}</p>
                    <p>{glossary[term]}</p>
                  </>
                )}
                {termExplanation.text && (
                  <p style={{ whiteSpace: "pre-line" }}>
                    {termExplanation.text}
                  </p>
                )}
              </div>

              <p className="muted">
                Plan context comes from your entered data. General definitions
                are AI-generated. Confirm actual coverage with your insurer.
              </p>
            </section>
          </>
        )}

        <footer>
          Illustrative estimates · Confirm benefits before booking
        </footer>
      </main>
    </div>
  );
}
