import { useEffect, useRef, useState } from "react";
import {
  formatDate,
  isInWaitingPeriod,
  waitingPeriodEnds,
} from "../../lib/coverage";
import type { MemberStatus, Plan, Procedure } from "../../types";
import { StepNav } from "./StepNav";

type Mapping = {
  status: "candidate" | "needs_clarification" | "no_match";
  candidate_codes: { code: string; reason: string }[];
  clarification_question: string | null;
};
function isMapping(value: unknown): value is Mapping {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    ["candidate", "needs_clarification", "no_match"].includes(
      String(v.status),
    ) &&
    Array.isArray(v.candidate_codes) &&
    v.candidate_codes.every(
      (c) =>
        c &&
        typeof c.code === "string" &&
        /^D\d{4}$/.test(c.code) &&
        typeof c.reason === "string",
    ) &&
    (v.clarification_question === null ||
      typeof v.clarification_question === "string")
  );
}

interface Props {
  procedures: Procedure[];
  procedure_code?: string;
  description: string;
  on_description_change: (description: string) => void;
  plan: Plan;
  member: Pick<MemberStatus, "coverage_start" | "as_of">;
  on_change: (cdt_code: string) => void;
  on_back: () => void;
  on_next: () => void;
}

export function ProcedureStep({
  procedures,
  procedure_code,
  description,
  on_description_change,
  plan,
  member,
  on_change,
  on_back,
  on_next,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function findCodes(clarify = false) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const additions =
      clarify && mapping?.clarification_question
        ? [
            ...history,
            `Question: ${mapping.clarification_question} Answer: ${answer.trim()}`,
          ]
        : [];
    on_change("");
    setMapping(null);
    setLoading(true);
    setError("");
    setUnsupported("");
    try {
      const response = await fetch("/api/cdt/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatment_description: [description.trim(), ...additions].join("\n"),
        }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Treatment lookup failed (HTTP ${response.status}). Please try again.`,
        );
      const data: unknown = await response.json();
      if (!isMapping(data))
        throw new Error("The treatment lookup returned an invalid response.");
      if (!controller.signal.aborted) {
        setMapping(data);
        const supported = data.candidate_codes.filter((candidate) =>
          procedures.some((procedure) => procedure.cdt_code === candidate.code),
        );
        if (
          data.status === "candidate" &&
          data.candidate_codes.length === 1 &&
          supported.length === 1
        ) {
          on_change(supported[0].code);
        } else {
          on_change("");
        }
        if (data.status === "candidate" && supported.length === 0) {
          setUnsupported("unavailable");
        }
        setHistory(additions);
        setAnswer("");
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Treatment lookup failed.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const selected = procedures.find((p) => p.cdt_code === procedure_code);
  const waiting =
    selected && isInWaitingPeriod(plan, member, selected.category);

  return (
    <>
      <section className="ob-fieldset">
        <h2>Procedure your dentist suggested</h2>
        <label htmlFor="treatment-description">
          Describe the treatment in your own words.
        </label>
        <textarea
          id="treatment-description"
          placeholder="For example: a porcelain crown on a back tooth"
          aria-describedby="treatment-help"
          rows={4}
          maxLength={2000}
          value={description}
          disabled={loading}
          onChange={(event) => {
            on_description_change(event.target.value);
            on_change("");
            setMapping(null);
            setHistory([]);
            setAnswer("");
            setUnsupported("");
            setError("");
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            font: "inherit",
          }}
        />
        <button
          type="button"
          disabled={loading || description.trim().length < 5}
          onClick={() => void findCodes()}
        >
          {loading ? "Checking treatment…" : "Check treatment"}
        </button>
        <div aria-live="polite">
          {error && (
            <p role="alert" className="ob-notice">
              {error}
            </p>
          )}
          {mapping?.status === "needs_clarification" && (
            <div>
              <label htmlFor="cdt-answer">
                {mapping.clarification_question}
              </label>
              <input
                id="cdt-answer"
                value={answer}
                maxLength={300}
                disabled={loading}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <button
                type="button"
                disabled={loading || !answer.trim() || history.length >= 3}
                onClick={() => void findCodes(true)}
              >
                Submit details
              </button>
              {history.length >= 3 && (
                <p>More treatment details are needed from your dentist.</p>
              )}
            </div>
          )}
          {mapping?.status === "no_match" && (
            <p className="ob-notice">
              Cost estimate unavailable. No matching treatment was found in this
              limited reference.
            </p>
          )}
          {mapping?.status === "candidate" &&
            mapping.candidate_codes.filter((candidate) =>
              procedures.some(
                (procedure) => procedure.cdt_code === candidate.code,
              ),
            ).length > 1 && (
              <fieldset>
                <legend>
                  Which treatment matches your dentist’s description?
                </legend>
                {mapping.candidate_codes.map((candidate) => {
                  const procedure = procedures.find(
                    (p) => p.cdt_code === candidate.code,
                  );
                  if (!procedure) return null;
                  return (
                    <label
                      key={candidate.code}
                      className="ob-choice ob-choice-card"
                    >
                      <input
                        type="radio"
                        name="matched-treatment"
                        checked={procedure_code === candidate.code}
                        onChange={() => on_change(candidate.code)}
                      />
                      <span>{procedure.name}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          <p id="treatment-help" className="ob-muted">
            We match your description to a treatment internally, then look up
            each provider’s price for that treatment.
          </p>
          {unsupported && (
            <p role="status" className="ob-notice">
              Cost estimate unavailable. Fee or coverage-category data is
              missing for this treatment.
            </p>
          )}
          {selected && <p role="status">Treatment matched: {selected.name}</p>}
        </div>
        <p className="ob-muted">
          Treatment matches are estimates. Final treatment and coverage details
          depend on your dentist and plan.
        </p>
      </section>

      {selected && waiting && (
        <p className="ob-notice" role="status">
          {plan.insurer} does not cover {selected.category} work until{" "}
          {formatDate(waitingPeriodEnds(plan, member, selected.category))}. You
          can still continue; the care plan will account for the wait.
        </p>
      )}

      <StepNav
        on_back={on_back}
        on_next={on_next}
        next_disabled={!selected || loading || !!unsupported}
      />
    </>
  );
}
