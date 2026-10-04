import { useState, type ReactNode } from "react";
import {
  formatDate,
  formatMoney,
  planYearResetDate,
  remainingDeductible,
  remainingMaximum,
} from "../../lib/coverage";
import type { SamplePlan } from "../../types";
import type { Draft } from "../draft";
import {
  generate_subscriber_id,
  is_valid_subscriber_id,
  normalize_subscriber_id,
} from "../subscriber_id";
import { StepNav } from "./StepNav";

interface Props {
  children?: ReactNode;
  plans: SamplePlan[];
  plan_id?: string;
  subscriber_id: string;
  on_change: (patch: Partial<Draft>) => void;
  on_back: () => void;
  on_next: () => void;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PlanStep({
  children,
  plans,
  plan_id,
  subscriber_id,
  on_change,
  on_back,
  on_next,
}: Props) {
  // Only show the format error after the user leaves the field.
  const [touched, set_touched] = useState(false);
  const sample = plans.find((s) => s.plan.id === plan_id);
  const id_valid = sample
    ? is_valid_subscriber_id(sample.plan, subscriber_id)
    : false;
  const show_id_error = touched && subscriber_id !== "" && !id_valid;

  return (
    <>
      <div className="ob-field">
        <label htmlFor="ob-insurer">Insurance company</label>
        <select
          id="ob-insurer"
          value={plan_id ?? ""}
          onChange={(e) => {
            // A new insurer means a new ID format, so clear the old ID.
            on_change({
              plan_id: e.target.value || undefined,
              subscriber_id: "",
            });
            set_touched(false);
          }}
        >
          <option value="">Choose a demo insurer and plan</option>
          {plans.map(({ plan }) => (
            <option key={plan.id} value={plan.id}>
              {plan.insurer} {plan.plan_name}
            </option>
          ))}
        </select>
      </div>

      {sample && (
        <>
          <div className="ob-field">
            <label htmlFor="ob-subscriber">Sample subscriber ID</label>
            <div className="ob-inline">
              <input
                id="ob-subscriber"
                value={subscriber_id}
                placeholder={sample.plan.subscriber_id_example}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={show_id_error}
                aria-describedby="ob-subscriber-hint"
                onChange={(e) => on_change({ subscriber_id: e.target.value })}
                onBlur={() => {
                  set_touched(true);
                  on_change({
                    subscriber_id: normalize_subscriber_id(subscriber_id),
                  });
                }}
              />
              <button
                type="button"
                className="ob-button-secondary"
                onClick={() => {
                  on_change({
                    subscriber_id: generate_subscriber_id(sample.plan),
                  });
                  set_touched(true);
                }}
              >
                Use a sample ID
              </button>
            </div>
            <p
              id="ob-subscriber-hint"
              className={show_id_error ? "ob-error" : "ob-muted"}
            >
              {show_id_error
                ? `That doesn't match this demo plan's sample format. It should look like ${sample.plan.subscriber_id_example}.`
                : `Mock ID for this demo, for example ${sample.plan.subscriber_id_example}.`}
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

      {children}
      <StepNav on_back={on_back} on_next={on_next} next_disabled={!id_valid} />
    </>
  );
}
