import { useState } from "react";
import {
  find_sample_plan,
  generate_subscriber_id,
  is_valid_subscriber_id,
  normalize_subscriber_id,
  sample_plans,
} from "../../data/plans";
import {
  formatDate,
  formatMoney,
  planYearResetDate,
  remainingDeductible,
  remainingMaximum,
} from "../../lib/coverage";
import type { Draft } from "../draft";
import { StepNav } from "./StepNav";

interface Props {
  planId?: string;
  subscriber_id: string;
  onChange: (patch: Partial<Draft>) => void;
  onBack: () => void;
  onNext: () => void;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PlanStep({
  planId,
  subscriber_id,
  onChange,
  onBack,
  onNext,
}: Props) {
  // Only show the format error after the user leaves the field.
  const [touched, setTouched] = useState(false);
  const sample = planId ? find_sample_plan(planId) : undefined;
  const idValid = sample
    ? is_valid_subscriber_id(sample.plan, subscriber_id)
    : false;
  const showIdError = touched && subscriber_id !== "" && !idValid;

  return (
    <>
      <div className="ob-field">
        <label htmlFor="ob-insurer">Insurance company</label>
        <select
          id="ob-insurer"
          value={planId ?? ""}
          onChange={(e) => {
            // A new insurer means a new ID format, so clear the old ID.
            onChange({
              planId: e.target.value || undefined,
              subscriber_id: "",
            });
            setTouched(false);
          }}
        >
          <option value="">Choose your insurer</option>
          {sample_plans.map(({ plan }) => (
            <option key={plan.id} value={plan.id}>
              {plan.insurer} {plan.plan_name}
            </option>
          ))}
        </select>
      </div>

      {sample && (
        <>
          <div className="ob-field">
            <label htmlFor="ob-subscriber">Subscriber ID</label>
            <div className="ob-inline">
              <input
                id="ob-subscriber"
                value={subscriber_id}
                placeholder={sample.plan.subscriber_id_example}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={showIdError}
                aria-describedby="ob-subscriber-hint"
                onChange={(e) => onChange({ subscriber_id: e.target.value })}
                onBlur={() => {
                  setTouched(true);
                  onChange({
                    subscriber_id: normalize_subscriber_id(subscriber_id),
                  });
                }}
              />
              <button
                type="button"
                className="ob-button-secondary"
                onClick={() => {
                  onChange({
                    subscriber_id: generate_subscriber_id(sample.plan),
                  });
                  setTouched(true);
                }}
              >
                Use a sample ID
              </button>
            </div>
            <p
              id="ob-subscriber-hint"
              className={showIdError ? "ob-error" : "ob-muted"}
            >
              {showIdError
                ? `That doesn't match ${sample.plan.insurer}'s format. It should look like ${sample.plan.subscriber_id_example}.`
                : `Printed on your insurance card, for example ${sample.plan.subscriber_id_example}.`}
            </p>
          </div>

          <dl className="ob-summary">
            <div>
              <dt>Yearly maximum left</dt>
              <dd>
                {formatMoney(
                  remainingMaximum(sample.plan, sample.default_member),
                )}{" "}
                <span className="ob-muted">
                  of {formatMoney(sample.plan.annual_maximum)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Deductible left</dt>
              <dd>
                {formatMoney(
                  remainingDeductible(sample.plan, sample.default_member),
                )}{" "}
                <span className="ob-muted">
                  of {formatMoney(sample.plan.deductible)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Plan pays</dt>
              <dd>
                {pct(sample.plan.coinsurance.preventive)} preventive,{" "}
                {pct(sample.plan.coinsurance.basic)} basic,{" "}
                {pct(sample.plan.coinsurance.major)} major
              </dd>
            </div>
            <div>
              <dt>Benefits reset</dt>
              <dd>{formatDate(planYearResetDate(sample.plan))}</dd>
            </div>
          </dl>
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!idValid} />
    </>
  );
}
