import { riskQuestions } from "../data/quiz";
import type { Procedure, QuizAnswers, QuizQuestion } from "../types";

export function questionsFor(procedure: Procedure): QuizQuestion[] {
  return riskQuestions.filter(
    (q) => !q.applies_to || q.applies_to.includes(procedure.treats_state),
  );
}

export function isQuizComplete(
  answers: QuizAnswers,
  questions: QuizQuestion[],
): boolean {
  return questions.every((q) => q.options.some((o) => o.id === answers[q.id]));
}

const MIN_MULTIPLIER = 0.25;
const MAX_MULTIPLIER = 4;

// Product of the chosen options' factors, clamped so a few extreme answers
// cannot make the simulation degenerate.
export function hazard_multiplier(
  answers: QuizAnswers,
  questions: QuizQuestion[],
): number {
  let m = 1;
  for (const q of questions) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (option) m *= option.factor;
  }
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, m));
}

// For Stage 2. Treat the base monthly probability p as coming from a constant
// hazard, then scale the hazard by m. The result stays in [0, 1] and is close
// to m * p when p is small.
export function scaleMonthlyProbability(p: number, m: number): number {
  return 1 - Math.pow(1 - p, m);
}
