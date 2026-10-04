import { useEffect, useRef, useState } from "react";
import {
  formatDate,
  formatMoney,
  isInWaitingPeriod,
  waitingPeriodEnds,
} from "../../lib/coverage";
import type { InsuranceType, MemberStatus, Plan, Procedure } from "../../types";
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
  plan: Plan;
  member: Pick<MemberStatus, "coverage_start" | "as_of">;
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
  const [description, setDescription] = useState("");
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
          `Code lookup failed (HTTP ${response.status}). Try again or select a sample procedure below.`,
        );
      const data: unknown = await response.json();
      if (!isMapping(data))
        throw new Error("The code mapper returned an invalid response.");
      if (!controller.signal.aborted) {
        setMapping(data);
        setHistory(additions);
        setAnswer("");
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Code lookup failed.",
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
        <h2>Find a possible CDT code</h2>
        <label htmlFor="treatment-description">
          What treatment did your dentist recommend?
        </label>
        <textarea
          id="treatment-description"
          rows={4}
          maxLength={2000}
          value={description}
          disabled={loading}
          onChange={(event) => {
            setDescription(event.target.value);
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
          {loading ? "Finding codes…" : "Find possible CDT codes"}
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
                <p>
                  Choose a sample procedure below or confirm the code with your
                  dentist.
                </p>
              )}
            </div>
          )}
          {mapping?.status === "no_match" && (
            <p className="ob-notice">
              No matching code was found in this limited reference. You can
              select a supported sample procedure below.
            </p>
          )}
          {mapping && mapping.candidate_codes.length > 0 && (
            <fieldset>
              <legend>Candidate CDT codes — verify with your dentist</legend>
              {mapping.candidate_codes.map((candidate) => {
                const procedure = procedures.find(
                  (p) => p.cdt_code === candidate.code,
                );
                return (
                  <div
                    key={candidate.code}
                    className="ob-choice-card"
                    style={{ padding: 12, margin: "8px 0" }}
                  >
                    <strong>
                      {candidate.code}
                      {procedure ? ` — ${procedure.name}` : ""}
                    </strong>
                    <p>{candidate.reason}</p>
                    <button
                      type="button"
                      disabled={loading || mapping.status !== "candidate"}
                      onClick={() => {
                        if (procedure) {
                          on_change(candidate.code);
                          setUnsupported("");
                        } else {
                          on_change("");
                          setUnsupported(candidate.code);
                        }
                      }}
                    >
                      {procedure
                        ? "Use this sample procedure"
                        : "Check cost availability"}
                    </button>
                  </div>
                );
              })}
            </fieldset>
          )}
          {unsupported && (
            <p role="status" className="ob-notice">
              Cost estimate unavailable for {unsupported}: this demo has no fee
              and plan-category mapping for it. Select a supported sample
              procedure below to continue.
            </p>
          )}
        </div>
        <p className="ob-muted">
          Candidate codes are not confirmed billing codes or coverage decisions.
          Code reference: Connecticut DSS Adult Dental Fee Schedule, effective
          October 1, 2026; updated September 29, 2026. CDT codes maintained by
          the American Dental Association. This reference contains a subset of
          CDT codes.{" "}
          <a
            href="https://www.ctdssmap.com/CTPortal/"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </p>
      </section>
      <fieldset className="ob-fieldset">
        <legend>Pick the procedure your dentist suggested.</legend>
        {procedures.map((p) => (
          <label key={p.cdt_code} className="ob-choice ob-choice-card">
            <input
              type="radio"
              name="procedure"
              value={p.cdt_code}
              checked={p.cdt_code === procedure_code}
              onChange={() => {
                on_change(p.cdt_code);
                setUnsupported("");
              }}
            />
            <span className="ob-choice-body">
              <span className="ob-choice-title">{p.name}</span>
              <span className="ob-muted">{p.description}</span>
            </span>
            <span className="ob-choice-meta">
              <span>{CATEGORY_LABEL[p.category]}</span>
              <span className="ob-muted">
                about {formatMoney(p.typical_fee)}
              </span>
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

      <StepNav
        on_back={on_back}
        on_next={on_next}
        next_disabled={!selected || loading || !!unsupported}
      />
    </>
  );
}
