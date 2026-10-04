// Values derived from the store. Pure functions of state.

import type { OnboardingRequest } from "../api";
import { field } from "../motion/config";
import { is_valid_subscriber_id } from "../onboarding/subscriber_id";
import type { Procedure, SamplePlan } from "../types";
import type { AppState, Remote } from "./store";

export function samplePlan(s: AppState): SamplePlan | null {
  return s.form.data?.plans.find((p) => p.plan.id === s.answers.planId) ?? null;
}

export function procedure(s: AppState): Procedure | null {
  return (
    s.form.data?.procedures.find(
      (p) => p.cdt_code === s.answers.procedureCode,
    ) ?? null
  );
}

export function subscriberValid(s: AppState): boolean {
  const sample = samplePlan(s);
  return (
    !!sample && is_valid_subscriber_id(sample.plan, s.answers.subscriberId)
  );
}

// Questions for the chosen procedure, once loaded.
export function questions(s: AppState) {
  return s.questions.key === s.answers.procedureCode ? s.questions.data : null;
}

export function quizComplete(s: AppState): boolean {
  const qs = questions(s);
  return (
    !!qs &&
    qs.every((q) => q.options.some((o) => o.id === s.answers.quiz[q.id]))
  );
}

// The body every planning endpoint takes, or null while intake is unfinished.
export function request(s: AppState): OnboardingRequest | null {
  const a = s.answers;
  if (!a.planId || !a.procedureCode || !subscriberValid(s)) return null;
  if (!a.subscriberConfirmed || !quizComplete(s)) return null;
  return {
    plan_id: a.planId,
    subscriber_id: a.subscriberId,
    procedure_code: a.procedureCode,
    quiz_answers: a.quiz,
  };
}

export function requestKey(s: AppState): string | null {
  const r = request(s);
  return r ? JSON.stringify(r) : null;
}

// Data that answers exactly this key, or null.
export function fresh<T>(r: Remote<T>, key: string | null): T | null {
  return key !== null && r.key === key && !r.loading ? r.data : null;
}

// Background spread from the quiz: answers that raise risk widen the lines,
// answers that lower it tighten them.
export function riskSpread(s: AppState): number {
  const qs = questions(s);
  if (!qs) return field.spreadDefault;
  let v = field.spreadDefault;
  for (const q of qs) {
    const effect = q.options.find((o) => o.id === s.answers.quiz[q.id])?.effect;
    if (effect === "raises") v += field.spreadStep;
    if (effect === "lowers") v -= field.spreadStep;
  }
  return Math.min(1, Math.max(0, v));
}

export function comparisonKey(s: AppState): string | null {
  const key = requestKey(s);
  return key && `${key}|${s.radius}|${s.tolerance}`;
}

export function carePlanKey(s: AppState): string | null {
  const key = requestKey(s);
  return key && s.providerId && `${key}|${s.providerId}|${s.tolerance}`;
}
