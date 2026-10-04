import {
  formatDate,
  formatMoney,
  isInWaitingPeriod,
  waitingPeriodEnds,
} from "../../lib/coverage";
import type { InsuranceType, MemberStatus, Plan, Procedure } from "../../types";
import { StepNav } from "./StepNav";

interface Props {
  procedures: Procedure[];
  procedure_code?: string;
  plan: Plan;
  member: Pick<MemberStatus, "coverage_start">;
  on_change: (cdt_code: string) => void;
  on_back: () => void;
  on_next: () => void;
}

const CATEGORY_LABEL: Record<InsuranceType, string> = {
  preventive: "Preventive",
  basic: "Basic",
  major: "Major",
};

export function ProcedureStep({
  procedures,
  procedure_code,
  plan,
  member,
  on_change,
  on_back,
  on_next,
}: Props) {
  const selected = procedures.find((p) => p.cdt_code === procedure_code);
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
              checked={p.cdt_code === procedure_code}
              onChange={() => on_change(p.cdt_code)}
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

      <StepNav on_back={on_back} on_next={on_next} next_disabled={!selected} />
    </>
  );
}
