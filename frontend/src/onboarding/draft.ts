import { find_sample_plan } from "../data/plans";
import { findProcedure } from "../data/procedures";
import { hazard_multiplier, isQuizComplete, questionsFor } from "../lib/risk";
import type { OnboardingResult, QuizAnswers } from "../types";

export type Step = "symptoms" | "plan" | "procedure" | "quiz" | "review";

export const STEPS: { id: Step; label: string; title: string }[] = [
  { id: "symptoms", label: "Symptoms", title: "First, a quick safety check" },
  { id: "plan", label: "Your plan", title: "Which dental plan do you have?" },
  {
    id: "procedure",
    label: "Procedure",
    title: "What does your dentist recommend?",
  },
  { id: "quiz", label: "Risk", title: "A few questions about your teeth" },
  { id: "review", label: "Review", title: "Check your details" },
];

// Everything the user has entered so far. Fields stay optional until the
// review step, where buildResult turns a complete draft into the contract.
export interface Draft {
  planId?: string;
  subscriber_id: string;
  procedureCode?: string;
  quiz_answers: QuizAnswers;
}

export const EMPTY_DRAFT: Draft = { subscriber_id: "", quiz_answers: {} };

// Root canal on the nearly exhausted Keystone plan, which shows the
// split-across-reset comparison best.
export const DEMO_DRAFT: Draft = {
  planId: "keystone-ppo",
  subscriber_id: "K417-2290-08",
  procedureCode: "D3330",
  quiz_answers: {
    sugar: "daily",
    brushing: "once",
    dry_mouth: "no",
    recent_cavities: "one",
    last_cleaning: "over_1yr",
    cold_sensitivity: "lingers",
    biting_pain: "no",
  },
};

// The only place a draft becomes an OnboardingResult. Returns null if
// anything is missing, so the review step can say what to fix.
export function buildResult(draft: Draft): OnboardingResult | null {
  const sample = draft.planId ? find_sample_plan(draft.planId) : undefined;
  const procedure = draft.procedureCode
    ? findProcedure(draft.procedureCode)
    : undefined;
  if (!sample || !procedure || !draft.subscriber_id) return null;

  const questions = questionsFor(procedure);
  if (!isQuizComplete(draft.quiz_answers, questions)) return null;

  // Drop answers to questions that no longer apply, e.g. the user answered
  // tooth-pain questions, then switched the procedure to a cleaning.
  const quiz_answers: QuizAnswers = {};
  for (const q of questions) quiz_answers[q.id] = draft.quiz_answers[q.id];

  return {
    plan: sample.plan,
    member: { ...sample.default_member, subscriber_id: draft.subscriber_id },
    procedure,
    quiz_answers,
    hazard_multiplier: hazard_multiplier(quiz_answers, questions),
  };
}
