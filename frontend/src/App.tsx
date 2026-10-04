import { useEffect, useState } from "react";
import {
  fetch_care_comparison,
  fetch_care_plan,
  fetch_providers,
  problems_of,
  type OnboardingRequest,
} from "./api";
import { Onboarding } from "./onboarding/Onboarding";
import type {
  CareComparison,
  CarePlan,
  OnboardingResult,
  ProviderCard,
} from "./types";
import { CompareScreen } from "./careplan/CompareScreen";
import { CarePlanScreen } from "./careplan/CarePlanScreen";
import { Tolerance } from "./careplan/shared";
import { RiskScreen } from "./screens/RiskScreen";
import "./careplan/careplan.css";

export default function App() {
  const [screen, setScreen] = useState<
    "onboarding" | "risk" | "compare" | "plan"
  >("onboarding");
  const [onboarding, setOnboarding] = useState<OnboardingResult | null>(null);
  const [radius, setRadius] = useState(25);
  const [tolerance, setTolerance] = useState("low");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CareComparison | null>(null);
  const [quotes, setQuotes] = useState<ProviderCard[]>([]);
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [planError, setPlanError] = useState("");
  const [retry, setRetry] = useState(0);
  const request: OnboardingRequest | null = onboarding
    ? {
        plan_id: onboarding.plan.id,
        subscriber_id: onboarding.member.subscriber_id,
        procedure_code: onboarding.procedure.cdt_code,
        quiz_answers: onboarding.quiz_answers,
      }
    : null;
  const requestKey = request ? JSON.stringify(request) : null;
  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    setCompareLoading(true);
    setCompareError("");
    const base = JSON.parse(requestKey) as OnboardingRequest;
    void Promise.all([
      fetch_care_comparison({
        ...base,
        radius_miles: radius,
        risk_tolerance: tolerance,
      }),
      fetch_providers({ ...base, radius_miles: radius }),
    ])
      .then(([comparison, prices]) => {
        if (!cancelled) {
          setComparison(comparison);
          setQuotes([...prices.in_network, ...prices.out_of_network]);
        }
      })
      .catch((error) => {
        if (!cancelled) setCompareError(problems_of(error).join(" "));
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, radius, tolerance, retry]);
  useEffect(() => {
    if (!requestKey || !providerId) return;
    let cancelled = false;
    setPlanLoading(true);
    setPlanError("");
    void fetch_care_plan({
      ...JSON.parse(requestKey),
      provider_id: providerId,
      risk_tolerance: tolerance,
    })
      .then((value) => {
        if (!cancelled) setPlan(value);
      })
      .catch((error) => {
        if (!cancelled) setPlanError(problems_of(error).join(" "));
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, providerId, tolerance, retry]);
  const bands = comparison?.risk_bands ?? [
    { name: "low", upper: 0.1 },
    { name: "medium", upper: 0.25 },
    { name: "high", upper: null },
  ];
  return (
    <div className="shell cp-shell">
      <aside>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setScreen("onboarding");
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
            { id: "onboarding", label: "Your details" },
            { id: "risk", label: "Tooth risk" },
            { id: "compare", label: "Compare providers" },
            { id: "plan", label: "Care plan" },
          ].map((item, i) => (
            <button
              key={item.id}
              className={screen === item.id ? "active" : ""}
              aria-current={screen === item.id ? "page" : undefined}
              disabled={item.id !== "onboarding" && !onboarding}
              onClick={() => setScreen(item.id as typeof screen)}
            >
              <span>{i + 1}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>Interactive demo</strong>
          <p>Sample providers, benefits and transition rates.</p>
        </div>
      </aside>
      <main>
        <header>
          <span>DENTAL BENEFITS OPTIMIZER</span>
          <span className="badge">Sample data</span>
        </header>
        <div hidden={screen !== "onboarding"}>
          <Onboarding
            on_complete={(value) => {
              setOnboarding(value);
              setProviderId(null);
              setPlan(null);
              setTolerance("low");
              setScreen("risk");
            }}
          />
        </div>
        {screen === "risk" && request && (
          <RiskScreen request={request} on_next={() => setScreen("compare")} />
        )}
        {(screen === "compare" || screen === "plan") && onboarding && (
          <>
            <div className="cp-controls">
              <Tolerance
                bands={bands}
                value={tolerance}
                onChange={setTolerance}
              />
              {screen === "compare" && (
                <label>
                  Search radius
                  <select
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                  >
                    <option value={5}>5 miles</option>
                    <option value={10}>10 miles</option>
                    <option value={25}>25 miles</option>
                    <option value={50}>50 miles</option>
                  </select>
                </label>
              )}
            </div>
            {screen === "compare" ? (
              <>
                <h1>Compare the cost of your care.</h1>
                <p>
                  {onboarding.procedure.name} · {onboarding.procedure.cdt_code}
                </p>
                {compareLoading ? (
                  <div className="card" role="status">
                    Pricing schedules and simulated futures…
                  </div>
                ) : compareError ? (
                  <div className="card" role="alert">
                    <p>{compareError}</p>
                    <button onClick={() => setRetry((r) => r + 1)}>
                      Retry comparison
                    </button>
                  </div>
                ) : (
                  comparison && (
                    <CompareScreen
                      data={comparison}
                      today={quotes}
                      onSelect={(id) => {
                        setProviderId(id);
                        setScreen("plan");
                      }}
                    />
                  )
                )}
              </>
            ) : !providerId ? (
              <div className="card">
                <h1>Your care plan</h1>
                <p>Select a provider to view its schedules.</p>
                <button
                  className="primary"
                  onClick={() => setScreen("compare")}
                >
                  Compare providers
                </button>
              </div>
            ) : planLoading || compareLoading ? (
              <div className="card" role="status">
                Loading your care plan…
              </div>
            ) : planError || compareError ? (
              <div className="card" role="alert">
                <p>{planError || compareError}</p>
                <button onClick={() => setRetry((r) => r + 1)}>
                  Retry care plan
                </button>
              </div>
            ) : (
              plan && (
                <CarePlanScreen
                  key={`${providerId}-${requestKey}-${tolerance}`}
                  data={plan}
                  onboarding={onboarding}
                  provider={quotes.find((p) => p.id === providerId)}
                />
              )
            )}
          </>
        )}
        <footer>
          Informational estimates · Actual fees, benefits and clinical timing
          require confirmation.
        </footer>
      </main>
    </div>
  );
}
