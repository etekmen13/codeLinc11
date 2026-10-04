import { useState } from "react";
import { acute_symptoms, type AcuteSymptomId } from "../../data/symptoms";
import { StepNav } from "./StepNav";

interface Props {
  on_urgent: () => void;
  on_clear: () => void;
}

export function SymptomCheck({ on_urgent, on_clear }: Props) {
  const [checked, set_checked] = useState<AcuteSymptomId[]>([]);

  const toggle = (id: AcuteSymptomId) =>
    set_checked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <>
      <fieldset className="ob-fieldset">
        <legend>Do you have any of these right now? Check all that apply.</legend>
        {acute_symptoms.map((s) => (
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
        on_next={checked.length > 0 ? on_urgent : on_clear}
        next_label={checked.length > 0 ? "Continue" : "None of these, continue"}
      />
    </>
  );
}
