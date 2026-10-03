import { useState } from "react";
import RiskAssessment from "./RiskAssessment";

type Plan = {
  maximum: number;
  used: number;
  deductible: number;
  coverage: number;
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

const procedureFees: Record<string, number> = {
  Cleaning: 150,
  Filling: 250,
  Crown: 1400,
  "Root canal": 1100,
  Extraction: 300,
};

const glossary: Record<string, string> = {
  Deductible:
    "The amount you pay for covered care before the plan starts sharing eligible costs.",
  Coinsurance:
    "The percentage of eligible costs you or your plan pays. If your plan pays 50%, you pay the other 50%, plus any deductible or uncovered charges.",
  "Annual maximum":
    "The most your dental plan will pay in one plan year. This limits the insurer’s payments.",
  "Balance billing":
    "When a provider charges more than the amount your plan recognizes, you may owe the difference.",
  "In-network":
    "A provider that has agreed to your plan’s network terms and negotiated fees.",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function estimate(provider: Provider, plan: Plan) {
  const allowed = Math.min(provider.fee, provider.allowed);
  const deductible = Math.min(allowed, plan.deductible);

  const paid = Math.min(
    Math.max(0, plan.maximum - plan.used),
    (Math.max(0, allowed - deductible) * plan.coverage) / 100,
  );

  return {
    paid,
    owed: provider.fee - paid,
    deductible,
    balance: provider.fee - allowed,
  };
}

export default function App() {
  const [step, setStep] = useState(0);

  const [plan, setPlan] = useState<Plan>({
    maximum: 1500,
    used: 900,
    deductible: 0,
    coverage: 50,
  });

  const [zip, setZip] = useState("27401");
  const [procedure, setProcedure] = useState("");
  const [procedureDescription, setProcedureDescription] = useState("");
  const [radius, setRadius] = useState(10);
  const [network, setNetwork] = useState(false);
  const [selected, setSelected] = useState<Provider | null>(null);
  const [term, setTerm] = useState("Deductible");
  const [error, setError] = useState("");
  const [acute, setAcute] = useState(false);

  const procedureProviders = providers.map((provider) => ({
    ...provider,
    fee: Math.round((provider.fee * (procedureFees[procedure] ?? 1400)) / 1400),
    allowed: Math.round(
      (provider.allowed * (procedureFees[procedure] ?? 1400)) / 1400,
    ),
  }));

  const remaining = Math.max(0, plan.maximum - plan.used);
  const result = selected ? estimate(selected, plan) : null;

  function updatePlan(key: keyof Plan, value: string) {
    setPlan((previous) => ({
      ...previous,
      [key]: Number(value),
    }));
    setSelected(null);
  }

  function navigate(destination: number) {
    if (destination > 0 && !procedure) {
      setError("Choose the procedure your dentist recommended.");
      setStep(0);
      return;
    }

    if (acute && destination > 1) {
      setStep(1);
      return;
    }

    setStep(destination);
  }

  const navigation = [
    "Your details",
    "Risk simulation",
    "Find providers",
    "Care plan",
    "Understand your plan",
  ];

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
          {navigation.map((label, index) => (
            <button
              key={label}
              type="button"
              className={step === index ? "active" : ""}
              aria-current={step === index ? "step" : undefined}
              onClick={() => navigate(index)}
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

        {step === 0 && (
          <>
            <h1>Let’s make your benefits work for you.</h1>

            <p className="intro">
              Tell us about your planned procedure and insurance plan.
            </p>

            <form
              className="card"
              onSubmit={(event) => {
                event.preventDefault();

                if (!procedure) {
                  setError("Choose the procedure your dentist recommended.");
                  return;
                }

                if (plan.used > plan.maximum) {
                  setError(
                    "Benefits already used cannot exceed the annual maximum.",
                  );
                  return;
                }

                setError("");
                setStep(1);
              }}
            >
              <h2>Your care</h2>

              <div className="grid">
                <label>
                  ZIP code
                  <input
                    required
                    value={zip}
                    pattern="[0-9]{5}"
                    maxLength={5}
                    inputMode="numeric"
                    onChange={(event) => setZip(event.target.value)}
                  />
                </label>

                <label>
                  What procedure are you planning?
                  <select
                    required
                    value={procedure}
                    onChange={(event) => {
                      setProcedure(event.target.value);
                      setSelected(null);
                      setError("");
                    }}
                  >
                    <option value="" disabled>
                      Select a procedure
                    </option>

                    {Object.keys(procedureFees).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Describe your planned procedure (optional)
                <textarea
                  rows={3}
                  value={procedureDescription}
                  onChange={(event) =>
                    setProcedureDescription(event.target.value)
                  }
                  placeholder="For example: My dentist recommended a crown on a back tooth."
                />
              </label>

              <p className="muted">
                Choose the procedure your dentist recommended. Provider fees and
                distances are illustrative demo data.
              </p>

              <h2>Your sample plan</h2>

              <div className="grid">
                {(
                  [
                    ["maximum", "Annual maximum ($)"],
                    ["used", "Benefits already used ($)"],
                    ["deductible", "Deductible remaining ($)"],
                    ["coverage", "Plan pays (%)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      min={0}
                      max={key === "coverage" ? 100 : undefined}
                      step="any"
                      value={plan[key]}
                      onChange={(event) => updatePlan(key, event.target.value)}
                    />
                  </label>
                ))}
              </div>

              <label className="check">
                <input
                  type="checkbox"
                  checked={acute}
                  onChange={(event) => setAcute(event.target.checked)}
                />
                I have severe pain, swelling, or fever.
              </label>

              {acute && (
                <p role="alert" className="notice">
                  Contact a dental professional promptly. This demo cannot
                  assess symptoms or determine whether care can safely wait.
                </p>
              )}

              {error && <p role="alert">{error}</p>}

              <button className="primary" type="submit">
                Continue to risk simulation →
              </button>
            </form>
          </>
        )}

        <div hidden={step !== 1}>
          {procedure && (
            <RiskAssessment
              key={procedure}
              procedure={procedure}
              acute={acute}
              onContinue={() => navigate(2)}
            />
          )}
        </div>

        {step === 2 && (
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

              <span className="muted">Demo location: {zip}</span>
            </div>

            <div className="providers">
              {procedureProviders
                .filter(
                  (provider) =>
                    provider.miles <= radius && (!network || provider.network),
                )
                .sort((a, b) => estimate(a, plan).owed - estimate(b, plan).owed)
                .map((provider) => {
                  const cost = estimate(provider, plan);

                  return (
                    <article className="card" key={provider.id}>
                      <span
                        className={
                          "badge " + (!provider.network ? "amber" : "")
                        }
                      >
                        {provider.network ? "In-network" : "Out-of-network"}
                      </span>

                      <h2>{provider.name}</h2>

                      <p className="muted">
                        {provider.miles} miles · Sample provider
                      </p>

                      <p className="muted">Estimated you pay</p>
                      <div className="price">{money(cost.owed)}</div>

                      <p>
                        Procedure fee: {money(provider.fee)}
                        <br />
                        Plan pays: {money(cost.paid)}
                      </p>

                      <button
                        className="primary"
                        type="button"
                        onClick={() => {
                          setSelected(provider);
                          setStep(3);
                        }}
                      >
                        Choose provider →
                      </button>
                    </article>
                  );
                })}
            </div>

            <p className="muted">
              Estimates assume the procedure is covered, with no waiting period
              or frequency restriction. Verify actual benefits and fees with
              your plan and dentist.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Your care, with the numbers explained.</h1>

            {!selected || !result ? (
              <div className="card">
                <p>Choose a provider to see your cost breakdown.</p>
                <button
                  className="primary"
                  type="button"
                  onClick={() => navigate(2)}
                >
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
                      Sample plan resets January 1. Confirm your actual reset
                      date and discuss treatment timing with your dentist.
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

        {step === 4 && (
          <>
            <h1>Insurance language, in plain English.</h1>

            <p className="intro">Understand the terms behind your estimate.</p>

            <section className="card">
              <label>
                Choose a term
                <select
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                >
                  {Object.keys(glossary).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="translation" aria-live="polite">
                <h2>{term}</h2>
                <p>{glossary[term]}</p>
              </div>

              <p className="muted">
                Demo glossary. Connect your FastAPI translator here for
                explanations grounded in the user’s plan.
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
