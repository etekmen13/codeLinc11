import { useState } from "react";
import { acuteSymptoms, type AcuteSymptomId } from "../../data/quiz";
import { StepNav } from "./StepNav";

interface Props {
  onUrgent: () => void;
  onClear: () => void;
}

export function SymptomCheck({ onUrgent, onClear }: Props) {
  const [checked, setChecked] = useState<AcuteSymptomId[]>([]);

  const toggle = (id: AcuteSymptomId) =>
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <>
      <fieldset className="ob-fieldset">
        <legend>Do you have any of these right now? Check all that apply.</legend>
        {acuteSymptoms.map((s) => (
          <label key={s.id} className="ob-choice">
            <input
              type="checkbox"
              checked={checked.includes(s.id)}
              onChange={() => toggle(s.id)}
            />
            <span>{s.prompt}</span>
          </label>
        ))}
      </fieldset>
      <StepNav
        onNext={checked.length > 0 ? onUrgent : onClear}
        nextLabel={checked.length > 0 ? "Continue" : "None of these, continue"}
      />
    </>
  );
}
