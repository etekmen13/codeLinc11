// Values derived from the store. Pure functions of state.

import type { CoverageInput, MemberInput, OnboardingRequest } from "../api";
import { field } from "../motion/config";
import type { Procedure, SamplePlan } from "../types";
import type { AppState, Remote } from "./store";

// The chosen sample plan as the backend has it, before the reader's edits.
export function baseSample(s: AppState): SamplePlan | null {
  return s.form.data?.plans.find((p) => p.plan.id === s.answers.planId) ?? null;
}

// Balances to send: the reader's, or the sample member's when confirmed
// numbers would put them over the plan's limits (a smaller maximum or
// deductible from a PDF). Clamped to those limits, which the backend
// requires. Null when the sample member's balances stand as they are.
function balances(
  base: SamplePlan,
  coverage: CoverageInput | null,
  member: MemberInput | null,
): MemberInput | null {
  const m = member ?? memberOf(base);
  const max = coverage?.annual_maximum ?? base.plan.annual_maximum;
  const deductible = coverage?.deductible ?? base.plan.deductible;
  if (!member && m.amount_used <= max && m.deductible_met <= deductible)
    return null;
  return {
    ...m,
    amount_used: Math.min(m.amount_used, max),
    deductible_met: Math.min(m.deductible_met, deductible),
  };
}

// The chosen plan with the reader's confirmed numbers and balances applied,
// the same way the backend applies them. Memoized, so it can be a selector.
let memo: {
  base: SamplePlan;
  coverage: CoverageInput | null;
  member: MemberInput | null;
  out: SamplePlan;
  balances: MemberInput | null;
} | null = null;
function reviewed(s: AppState) {
  const base = baseSample(s);
  const { coverage, member } = s.answers;
  if (!base) return null;
  if (
    memo?.base === base &&
    memo.coverage === coverage &&
    memo.member === member
  )
    return memo;
  const sent = balances(base, coverage, member);
  const out: SamplePlan =
    !coverage && !sent
      ? base
      : {
          ...base,
          plan: coverage
            ? {
                ...base.plan,
                annual_maximum: coverage.annual_maximum,
                deductible: coverage.deductible,
                coinsurance: {
                  ...base.plan.coinsurance,
                  preventive: coverage.preventive,
                  basic: coverage.basic,
                  major: coverage.major,
                },
                plan_year_start: coverage.plan_year_start,
              }
            : base.plan,
          default_member: sent
            ? { ...base.default_member, ...sent }
            : base.default_member,
        };
  memo = { base, coverage, member, out, balances: sent };
  return memo;
}

export function samplePlan(s: AppState): SamplePlan | null {
  return reviewed(s)?.out ?? null;
}

// The plan's numbers as the coverage request carries them.
export function coverageOf(sample: SamplePlan): CoverageInput {
  const p = sample.plan;
  return {
    annual_maximum: p.annual_maximum,
    deductible: p.deductible,
    preventive: p.coinsurance.preventive,
    basic: p.coinsurance.basic,
    major: p.coinsurance.major,
    plan_year_start: p.plan_year_start,
  };
}

export function memberOf(sample: SamplePlan): MemberInput {
  const m = sample.default_member;
  return {
    as_of: m.as_of,
    coverage_start: m.coverage_start,
    amount_used: m.amount_used,
    deductible_met: m.deductible_met,
  };
}

export function procedure(s: AppState): Procedure | null {
  return (
    s.form.data?.procedures.find(
      (p) => p.cdt_code === s.answers.procedureCode,
    ) ?? null
  );
}

// The ID is optional; the backend only limits its length.
export const SUBSCRIBER_MAX = 100;
export function subscriberValid(s: AppState): boolean {
  return s.answers.subscriberId.length <= SUBSCRIBER_MAX;
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
    subscriber_id: a.subscriberId.trim(),
    procedure_code: a.procedureCode,
    quiz_answers: a.quiz,
    ...(a.coverage && { coverage: a.coverage }),
    ...(reviewed(s)?.balances && { member: reviewed(s)!.balances! }),
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
