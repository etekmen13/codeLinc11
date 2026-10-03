import { procedures } from "../../data/procedures";
import {
  formatDate,
  formatMoney,
  isInWaitingPeriod,
  waitingPeriodEnds,
} from "../../lib/coverage";
import type { InsuranceType, MemberStatus, Plan } from "../../types";
import { StepNav } from "./StepNav";

interface Props {
  procedureCode?: string;
  plan: Plan;
  member: Pick<MemberStatus, "coverage_start">;
  onChange: (cdt_code: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const CATEGORY_LABEL: Record<InsuranceType, string> = {
  preventive: "Preventive",
  basic: "Basic",
  major: "Major",
};

export function ProcedureStep({
  procedureCode,
  plan,
  member,
  onChange,
  onBack,
  onNext,
}: Props) {
  const selected = procedures.find((p) => p.cdt_code === procedureCode);
  const waiting =
    selected && isInWaitingPeriod(plan, member, selected.category);

  return (
    <>
      <fieldset className="ob-fieldset">
        <legend>Pick the procedure your dentist suggested.</legend>
        {procedures.map((p) => (
          <label key={p.cdt_code} className="ob-choice ob-choice-card">
            <input
              type="radio"
              name="procedure"
              value={p.cdt_code}
              checked={p.cdt_code === procedureCode}
              onChange={() => onChange(p.cdt_code)}
            />
            <span className="ob-choice-body">
              <span className="ob-choice-title">{p.name}</span>
              <span className="ob-muted">{p.description}</span>
            </span>
            <span className="ob-choice-meta">
              <span>{CATEGORY_LABEL[p.category]}</span>
              <span className="ob-muted">about {formatMoney(p.typical_fee)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {selected && waiting && (
        <p className="ob-notice" role="status">
          {plan.insurer} does not cover {selected.category} work until{" "}
          {formatDate(waitingPeriodEnds(plan, member, selected.category))}. You
          can still continue; the care plan will account for the wait.
        </p>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!selected} />
    </>
  );
}
