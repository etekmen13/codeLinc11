import { formatMoney, remainingMaximum } from "../../lib/coverage";
import type { OnboardingResult } from "../../types";
import type { Step } from "../draft";
import { StepNav } from "./StepNav";

interface Props {
  result: OnboardingResult | null;
  onEdit: (step: Step) => void;
  onBack: () => void;
  onConfirm: (result: OnboardingResult) => void;
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ob-link ob-edit" onClick={onClick}>
      Edit
    </button>
  );
}

function describeRisk(m: number): string {
  if (m < 0.9) return "Below demo baseline";
  if (m <= 1.1) return "Near demo baseline";
  return "Above demo baseline";
}

export function ReviewStep({ result, onEdit, onBack, onConfirm }: Props) {
  if (!result) {
    return (
      <>
        <p className="ob-error">
          Some details are missing. Go back and finish each step.
        </p>
        <StepNav onBack={onBack} onNext={() => onEdit("plan")} nextLabel="Go to plan" />
      </>
    );
  }

  const { plan, member, procedure, hazard_multiplier } = result;

  return (
    <>
      <dl className="ob-summary ob-review">
        <div>
          <dt>Plan</dt>
          <dd>
            {plan.insurer} {plan.plan_name}, ID{" "}
            <span className="ob-nowrap">{member.subscriber_id}</span>
            <span className="ob-muted">
              {" "}
              ({formatMoney(remainingMaximum(plan, member))} of yearly maximum left)
            </span>
            <EditButton onClick={() => onEdit("plan")} />
          </dd>
        </div>
        <div>
          <dt>Procedure</dt>
          <dd>
            {procedure.name}
            <span className="ob-muted"> (about {formatMoney(procedure.typical_fee)})</span>
            <EditButton onClick={() => onEdit("procedure")} />
          </dd>
        </div>
        <div>
          <dt>Illustrative quiz multiplier</dt>
          <dd>
            {describeRisk(hazard_multiplier)}
            <span className="ob-muted"> ({hazard_multiplier.toFixed(2)}× baseline)</span>
            <EditButton onClick={() => onEdit("quiz")} />
          </dd>
        </div>
      </dl>
      <StepNav
        onBack={onBack}
        onNext={() => onConfirm(result)}
        nextLabel="Compare providers"
      />
    </>
  );
}
