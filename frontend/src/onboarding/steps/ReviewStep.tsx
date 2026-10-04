import { formatMoney, remainingMaximum } from "../../lib/coverage";
import { displayText } from "../../lib/displayText";
import type { Procedure, SamplePlan } from "../../types";
import type { Step } from "../draft";
import { StepNav } from "./StepNav";

interface Props {
  sample?: SamplePlan;
  procedure?: Procedure;
  subscriber_id: string;
  answer_count: number;
  can_submit: boolean;
  submitting: boolean;
  problems: string[] | null; // from the backend's 422 response
  on_edit: (step: Step) => void;
  on_back: () => void;
  on_submit: () => void;
}

function EditButton({ on_click }: { on_click: () => void }) {
  return (
    <button type="button" className="ob-link ob-edit" onClick={on_click}>
      Edit
    </button>
  );
}

export function ReviewStep({
  sample,
  procedure,
  subscriber_id,
  answer_count,
  can_submit,
  submitting,
  problems,
  on_edit,
  on_back,
  on_submit,
}: Props) {
  return (
    <>
      <dl className="ob-summary ob-review">
        <div>
          <dt>Plan</dt>
          <dd>
            {sample ? (
              <>
                {sample.plan.insurer} {sample.plan.plan_name}
                {subscriber_id.trim() ? (
                  <span className="ob-nowrap">, ID {subscriber_id}</span>
                ) : (
                  <span className="ob-muted"> — no subscriber ID provided</span>
                )}
                <span className="ob-muted">
                  {" "}
                  (
                  {formatMoney(
                    remainingMaximum(sample.plan, sample.default_member),
                  )}{" "}
                  of yearly maximum left)
                </span>
              </>
            ) : (
              "Not chosen"
            )}
            <EditButton on_click={() => on_edit("plan")} />
          </dd>
        </div>
        <div>
          <dt>Procedure</dt>
          <dd>
            {procedure ? (
              <>
                {displayText(procedure.name)}
                <span className="ob-muted">
                  {" "}
                  (pricing is shown for each provider in the comparison)
                </span>
              </>
            ) : (
              "Not chosen"
            )}
            <EditButton on_click={() => on_edit("procedure")} />
          </dd>
        </div>
        <div>
          <dt>Risk questions</dt>
          <dd>
            {answer_count} answered
            <EditButton on_click={() => on_edit("quiz")} />
          </dd>
        </div>
      </dl>

      {problems && (
        <div className="ob-notice" role="alert">
          <p>Fix these and submit again:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{displayText(p)}</li>
            ))}
          </ul>
        </div>
      )}

      <StepNav
        on_back={on_back}
        on_next={on_submit}
        next_label={submitting ? "Checking your details…" : "Compare providers"}
        next_disabled={!can_submit || submitting}
      />
    </>
  );
}
