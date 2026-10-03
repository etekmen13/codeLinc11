import { useEffect, useRef, useState } from "react";
import { find_sample_plan } from "../data/plans";
import { findProcedure } from "../data/procedures";
import { questionsFor } from "../lib/risk";
import type { OnboardingResult } from "../types";
import {
  buildResult,
  DEMO_DRAFT,
  EMPTY_DRAFT,
  STEPS,
  type Draft,
  type Step,
} from "./draft";
import "./onboarding.css";
import { PlanStep } from "./steps/PlanStep";
import { ProcedureStep } from "./steps/ProcedureStep";
import { QuizStep } from "./steps/QuizStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SymptomCheck } from "./steps/SymptomCheck";
import { UrgentCare } from "./steps/UrgentCare";

interface Props {
  onComplete: (result: OnboardingResult) => void;
}

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("symptoms");
  const [urgent, setUrgent] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new heading so keyboard and screen-reader users
  // land at the top of each step.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, urgent]);

  const update = (patch: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const index = STEPS.findIndex((s) => s.id === step);
  const go = (offset: number) => setStep(STEPS[index + offset].id);
  const next = () => go(1);
  const back = () => go(-1);

  const sample = draft.planId ? find_sample_plan(draft.planId) : undefined;
  const procedure = draft.procedureCode
    ? findProcedure(draft.procedureCode)
    : undefined;

  if (urgent) {
    return (
      <main className="ob">
        <UrgentCare headingRef={headingRef} onBack={() => setUrgent(false)} />
      </main>
    );
  }

  return (
    <main className="ob">
      <header className="ob-header">
        <ol className="ob-steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              aria-current={s.id === step ? "step" : undefined}
              data-done={i < index ? "" : undefined}
            >
              <span className="ob-step-num">{i + 1}</span>
              <span className="ob-step-label">{s.label}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="ob-link"
          onClick={() => {
            setDraft(DEMO_DRAFT);
            setStep("symptoms");
          }}
        >
          Fill with demo data
        </button>
      </header>

      <section className="ob-panel" aria-labelledby="ob-title">
        <h1 id="ob-title" ref={headingRef} tabIndex={-1}>
          {STEPS[index].title}
        </h1>

        {step === "symptoms" && (
          <SymptomCheck onUrgent={() => setUrgent(true)} onClear={next} />
        )}

        {step === "plan" && (
          <PlanStep
            planId={draft.planId}
            subscriber_id={draft.subscriber_id}
            onChange={update}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "procedure" && sample && (
          <ProcedureStep
            procedureCode={draft.procedureCode}
            plan={sample.plan}
            member={sample.default_member}
            onChange={(cdt_code) => update({ procedureCode: cdt_code })}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "quiz" && procedure && (
          <QuizStep
            questions={questionsFor(procedure)}
            answers={draft.quiz_answers}
            onAnswer={(questionId, optionId) =>
              update({
                quiz_answers: { ...draft.quiz_answers, [questionId]: optionId },
              })
            }
            onBack={back}
            onNext={next}
          />
        )}

        {step === "review" && (
          <ReviewStep
            result={buildResult(draft)}
            onEdit={setStep}
            onBack={back}
            onConfirm={onComplete}
          />
        )}
      </section>
    </main>
  );
}
