import { isQuizComplete } from "../../lib/risk";
import type { QuizAnswers, QuizQuestion } from "../../types";
import { StepNav } from "./StepNav";

interface Props {
  questions: QuizQuestion[];
  answers: QuizAnswers;
  onAnswer: (questionId: string, optionId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function QuizStep({ questions, answers, onAnswer, onBack, onNext }: Props) {
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
                  onChange={() => onAnswer(q.id, o.id)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!isQuizComplete(answers, questions)}
      />
    </>
  );
}
