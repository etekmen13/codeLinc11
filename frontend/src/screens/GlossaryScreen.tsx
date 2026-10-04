import { useState } from "react";

const glossary: Record<string, string> = {
  Deductible:
    "The amount you pay for covered care before the plan starts sharing eligible costs.",
  Coinsurance:
    "The percentage of eligible costs you or your plan pays. In this demo, “plan pays 50%” means you pay the other 50%, plus any deductible or uncovered charges.",
  "Annual maximum":
    "The most your dental plan will pay in one plan year. This is a limit on the insurer’s payments.",
  "Balance billing":
    "When a provider charges more than the amount your plan recognizes, you may owe the difference.",
  "In-network":
    "A provider that has agreed to your plan’s network terms and negotiated fees.",
};

// Static for now; see the note at the bottom of the screen.
export function GlossaryScreen() {
  const [term, setTerm] = useState("Deductible");
  return (
    <>
      <h1>Insurance language, in plain English.</h1>
      <p className="intro">Understand the terms behind your estimate.</p>
      <section className="card">
        <label>
          Choose a term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {Object.keys(glossary).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="translation" aria-live="polite">
          <h2>{term}</h2>
          <p>{glossary[term]}</p>
        </div>
        <p className="muted">
          Demo glossary. Connect your FastAPI translator here for explanations
          grounded in the user’s plan.
        </p>
      </section>
    </>
  );
}
