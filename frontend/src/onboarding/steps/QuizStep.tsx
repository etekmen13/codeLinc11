import { useEffect, useState } from "react";
import { fetch_quiz, problems_of } from "../../api";
import { displayText } from "../../lib/displayText";
import type { QuizAnswers, QuizQuestion } from "../../types";
import { is_quiz_complete } from "../draft";
import { StepNav } from "./StepNav";

interface Props {
  procedure_code: string;
  answers: QuizAnswers;
  on_answer: (question_id: string, option_id: string) => void;
  on_back: () => void;
  on_next: () => void;
}

export function QuizStep({
  procedure_code,
  answers,
  on_answer,
  on_back,
  on_next,
}: Props) {
  const [questions, set_questions] = useState<QuizQuestion[] | null>(null);
  const [error, set_error] = useState<string[] | null>(null);

  // Refetched each time this step is shown; the request is small.
  useEffect(() => {
    fetch_quiz(procedure_code)
      .then(set_questions)
      .catch((err: unknown) => set_error(problems_of(err)));
  }, [procedure_code]);

  if (error) {
    return (
      <>
        <p className="ob-error">
          Could not load questions: {displayText(error.join("; "))}
        </p>
        <StepNav on_back={on_back} on_next={on_next} next_disabled />
      </>
    );
  }
  if (!questions) return <p className="ob-muted">Loading questions…</p>;

  return (
    <>
      <p className="ob-muted">
        Your answers adjust how quickly the problem is likely to get worse if
        treatment waits.
      </p>
      {questions.map((q) => (
        <fieldset key={q.id} className="ob-fieldset">
          <legend>{q.prompt}</legend>
          <div className="ob-options">
            {q.options.map((o) => (
              <label key={o.id} className="ob-choice ob-choice-pill">
                <input
                  type="radio"
                  name={q.id}
                  value={o.id}
                  checked={answers[q.id] === o.id}
                  onChange={() => on_answer(q.id, o.id)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <StepNav
        on_back={on_back}
        on_next={on_next}
        next_disabled={!is_quiz_complete(answers, questions)}
      />
    </>
  );
}
