import { type ReactNode } from "react";
import {
  formatDate,
  formatMoney,
  planYearResetDate,
  remainingDeductible,
  remainingMaximum,
} from "../../lib/coverage";
import type { SamplePlan } from "../../types";
import type { Draft } from "../draft";
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
  const sample = plans.find((s) => s.plan.id === plan_id);

  return (
    <>
      <div className="ob-field">
        <label htmlFor="ob-insurer">Insurance company</label>
        <select
          id="ob-insurer"
          value={plan_id ?? ""}
          onChange={(e) => {
            // Clear the optional ID when switching plans.
            on_change({
              plan_id: e.target.value || undefined,
              subscriber_id: "",
            });
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
          <details>
            <summary>Add a subscriber ID (optional)</summary>
            <div className="ob-field">
              <label htmlFor="ob-subscriber">Subscriber ID (optional)</label>
              <input
                id="ob-subscriber"
                value={subscriber_id}
                maxLength={100}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="ob-subscriber-hint"
                onChange={(e) => on_change({ subscriber_id: e.target.value })}
              />
              <p id="ob-subscriber-hint" className="ob-muted">
                Leave this blank to use PDF or manual intake. This app does not
                verify eligibility or look up benefits using your ID.
              </p>
            </div>
          </details>

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
      <StepNav on_back={on_back} on_next={on_next} next_disabled={!sample} />
    </>
  );
}
