import { useEffect, useRef, useState } from "react";
import {
  fetch_form,
  problems_of,
  submit_onboarding,
  type FormOptions,
  type OnboardingRequest,
} from "../api";
import type { OnboardingResult } from "../types";
import {
  build_request,
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
  // The request goes along so later screens can send it to the endpoints
  // that take the same body.
  on_complete: (result: OnboardingResult, request: OnboardingRequest) => void;
}

export function Onboarding({ on_complete }: Props) {
  const [step, set_step] = useState<Step>("symptoms");
  const [urgent, set_urgent] = useState(false);
  const [draft, set_draft] = useState<Draft>(EMPTY_DRAFT);
  const [form, set_form] = useState<FormOptions | null>(null);
  const [form_error, set_form_error] = useState<string[] | null>(null);
  const [submitting, set_submitting] = useState(false);
  const [submit_error, set_submit_error] = useState<string[] | null>(null);
  const heading_ref = useRef<HTMLHeadingElement>(null);

  // Load plans and procedures once, while the user is on the symptom check.
  useEffect(() => {
    fetch_form()
      .then(set_form)
      .catch((err: unknown) => set_form_error(problems_of(err)));
  }, []);

  // Move focus to the new heading so keyboard and screen-reader users
  // land at the top of each step.
  useEffect(() => {
    heading_ref.current?.focus();
  }, [step, urgent]);

  const update = (patch: Partial<Draft>) =>
    set_draft((prev) => ({ ...prev, ...patch }));

  const index = STEPS.findIndex((s) => s.id === step);
  const next = () => set_step(STEPS[index + 1].id);
  const back = () => set_step(STEPS[index - 1].id);

  const sample = form?.plans.find((s) => s.plan.id === draft.plan_id);
  const procedure = form?.procedures.find(
    (p) => p.cdt_code === draft.procedure_code,
  );

  async function submit() {
    const request = build_request(draft);
    if (!request) return;
    set_submitting(true);
    set_submit_error(null);
    try {
      on_complete(await submit_onboarding(request), request);
    } catch (err) {
      set_submit_error(problems_of(err));
    } finally {
      set_submitting(false);
    }
  }

  if (urgent) {
    return (
      <main className="ob">
        <UrgentCare
          heading_ref={heading_ref}
          on_back={() => set_urgent(false)}
        />
      </main>
    );
  }

  // Every step after the symptom check needs the plan and procedure lists.
  const needs_form = step !== "symptoms";

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
            set_draft(DEMO_DRAFT);
            set_submit_error(null);
            set_step("symptoms");
          }}
        >
          Fill with demo data
        </button>
      </header>

      <section className="ob-panel" aria-labelledby="ob-title">
        <h1 id="ob-title" ref={heading_ref} tabIndex={-1}>
          {STEPS[index].title}
        </h1>

        {step === "symptoms" && (
          <SymptomCheck on_urgent={() => set_urgent(true)} on_clear={next} />
        )}

        {needs_form && form_error && (
          <p className="ob-error">
            Could not load plans and procedures: {form_error.join("; ")}. Check
            that the backend is running, then reload the page.
          </p>
        )}
        {needs_form && !form && !form_error && (
          <p className="ob-muted">Loading plans and procedures…</p>
        )}

        {form && step === "plan" && (
          <PlanStep
            plans={form.plans}
            plan_id={draft.plan_id}
            subscriber_id={draft.subscriber_id}
            on_change={update}
            on_back={back}
            on_next={next}
          />
        )}

        {form && step === "procedure" && sample && (
          <ProcedureStep
            procedures={form.procedures}
            procedure_code={draft.procedure_code}
            description={draft.treatment_description ?? ""}
            on_description_change={(treatment_description) =>
              update({ treatment_description })
            }
            plan={sample.plan}
            member={sample.default_member}
            on_change={(cdt_code) =>
              update({ procedure_code: cdt_code, quiz_answers: {} })
            }
            on_back={back}
            on_next={next}
          />
        )}

        {form && step === "quiz" && draft.procedure_code && (
          <QuizStep
            procedure_code={draft.procedure_code}
            answers={draft.quiz_answers}
            on_answer={(question_id, option_id) =>
              update({
                quiz_answers: {
                  ...draft.quiz_answers,
                  [question_id]: option_id,
                },
              })
            }
            on_back={back}
            on_next={next}
          />
        )}

        {form && step === "review" && (
          <ReviewStep
            sample={sample}
            procedure={procedure}
            subscriber_id={draft.subscriber_id}
            answer_count={Object.keys(draft.quiz_answers).length}
            can_submit={build_request(draft) !== null}
            submitting={submitting}
            problems={submit_error}
            on_edit={set_step}
            on_back={back}
            on_submit={submit}
          />
        )}
      </section>
    </main>
  );
}
