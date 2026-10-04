import type { OnboardingRequest } from "../api";
import type { QuizAnswers, QuizQuestion } from "../types";

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

// Everything the user has entered so far. The backend validates it all on
// submit; the form only checks that each step has an answer.
export interface Draft {
  plan_id?: string;
  subscriber_id: string;
  procedure_code?: string;
  quiz_answers: QuizAnswers;
}

export const EMPTY_DRAFT: Draft = { subscriber_id: "", quiz_answers: {} };

// Root canal on the nearly exhausted Keystone plan, which shows the
// split-across-reset comparison best. Ids must match the backend; if they
// drift, the submit error says which one.
export const DEMO_DRAFT: Draft = {
  plan_id: "keystone-ppo",
  subscriber_id: "K417-2290-08",
  procedure_code: "D3330",
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

export function is_quiz_complete(
  answers: QuizAnswers,
  questions: QuizQuestion[],
): boolean {
  return questions.every((q) => q.options.some((o) => o.id === answers[q.id]));
}

// The only place a draft becomes a request. Null if a step is unfinished.
export function build_request(d: Draft): OnboardingRequest | null {
  if (!d.plan_id || !d.procedure_code || !d.subscriber_id.trim()) return null;
  return {
    plan_id: d.plan_id,
    subscriber_id: d.subscriber_id,
    procedure_code: d.procedure_code,
    quiz_answers: d.quiz_answers,
  };
}
