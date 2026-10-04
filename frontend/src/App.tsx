import { useState } from "react";
import type { OnboardingRequest } from "./api";
import { Onboarding } from "./onboarding/Onboarding";
import { CarePlanScreen } from "./screens/CarePlanScreen";
import { CompareScreen, type ChosenDentist } from "./screens/CompareScreen";
import { GlossaryScreen } from "./screens/GlossaryScreen";
import { RiskScreen } from "./screens/RiskScreen";
import type { OnboardingResult } from "./types";

const STEPS = [
  "Your details",
  "Tooth risk",
  "Compare dentists",
  "Care plan",
  "Understand your plan",
];
const [DETAILS, RISK, COMPARE, CARE_PLAN, GLOSSARY] = STEPS.keys();

// The 25-mile default of the compare endpoint.
const DEFAULT_RADIUS_MILES = 25;

// Flow state only: each screen fetches its own data from these.
export default function App() {
  const [step, set_step] = useState(DETAILS);
  const [request, set_request] = useState<OnboardingRequest | null>(null);
  const [result, set_result] = useState<OnboardingResult | null>(null);
  // null: the lowest risk band, the backend's default
  const [tolerance, set_tolerance] = useState<string | null>(null);
  const [radius, set_radius] = useState(DEFAULT_RADIUS_MILES);
  const [in_network_only, set_in_network_only] = useState(false);
  const [dentist, set_dentist] = useState<ChosenDentist | null>(null);

  // A screen that needs data from an earlier step falls back to that step.
  function go(to: number) {
    if (to === GLOSSARY) set_step(to);
    else if (!request) set_step(DETAILS);
    else if (to === CARE_PLAN && !dentist) set_step(COMPARE);
    else set_step(to);
  }

  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            set_step(DETAILS);
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
          {STEPS.map((label, i) => (
            <button
              key={label}
              className={step === i ? "active" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => go(i)}
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
        <div hidden={step !== DETAILS}>
          <Onboarding
            on_complete={(value, req) => {
              set_result(value);
              set_request(req);
              set_tolerance(null);
              set_dentist(null);
              set_step(RISK);
            }}
          />
        </div>
        {step === RISK && request && (
          <RiskScreen request={request} on_next={() => set_step(COMPARE)} />
        )}
        {step === COMPARE && request && (
          <CompareScreen
            request={request}
            tolerance={tolerance}
            on_tolerance={set_tolerance}
            radius={radius}
            on_radius={set_radius}
            in_network_only={in_network_only}
            on_in_network_only={set_in_network_only}
            on_choose={(d) => {
              set_dentist(d);
              set_step(CARE_PLAN);
            }}
          />
        )}
        {step === CARE_PLAN && request && result && dentist && (
          <CarePlanScreen
            request={request}
            procedure={result.procedure.name}
            dentist={dentist}
            tolerance={tolerance}
            on_back={() => set_step(COMPARE)}
          />
        )}
        {step === GLOSSARY && <GlossaryScreen />}
        <footer>
          Illustrative estimates · Confirm benefits before booking
        </footer>
      </main>
    </div>
  );
}
