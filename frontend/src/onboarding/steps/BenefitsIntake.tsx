import { useState } from "react";
import {
  extract_coverage,
  problems_of,
  type CoverageExtraction,
  type CoverageInput,
  type MemberInput,
} from "../../api";
import type { SamplePlan } from "../../types";
import type { Draft } from "../draft";

export function BenefitsIntake({
  sample,
  draft,
  on_change,
}: {
  sample: SamplePlan;
  draft: Draft;
  on_change: (patch: Partial<Draft>) => void;
}) {
  const [result, setResult] = useState<CoverageExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const plan = sample.plan;
  const coverage: CoverageInput = draft.coverage ?? {
    annual_maximum: plan.annual_maximum,
    deductible: plan.deductible,
    ...plan.coinsurance,
    plan_year_start: plan.plan_year_start,
  };
  const member: MemberInput = draft.member ?? {
    as_of: sample.default_member.as_of,
    coverage_start: sample.default_member.coverage_start,
    amount_used: sample.default_member.amount_used,
    deductible_met: sample.default_member.deductible_met,
  };
  async function upload(file: File) {
    setBusy(true);
    setError("");
    setResult(null);
    setConfirmed(false);
    try {
      setResult(await extract_coverage(file));
    } catch (e) {
      setError(problems_of(e).join("; "));
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    const next = { ...coverage };
    for (const key of [
      "annual_maximum",
      "deductible",
      "preventive",
      "basic",
      "major",
    ] as const) {
      const candidate = result?.fields[key];
      if (candidate && typeof candidate.value === "number")
        next[key] = candidate.value;
    }
    on_change({ coverage: next });
    setConfirmed(true);
  }
  return (
    <section aria-label="Coverage document and benefit balances">
      <h2>Review your benefits</h2>
      <p className="ob-muted">
        Real insurer names; fictional demo plans, IDs, fees, provider networks
        and claims history. Editing these fields updates estimates. Other plan
        rules remain mock.
      </p>
      <div className="ob-field">
        <label htmlFor="coverage-pdf">
          Upload a dental coverage PDF (optional, up to 10 MB)
        </label>
        <input
          id="coverage-pdf"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {busy && <p role="status">Reading coverage document…</p>}
      {error && (
        <p role="alert" className="ob-error">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          {result.warnings.map((w) => (
            <p key={w} className="ob-muted">
              {w}
            </p>
          ))}
          <dl className="ob-summary">
            {Object.entries(result.fields).map(([key, field]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>
                  {String(field.value)} — page {field.page}: {field.evidence}
                </dd>
              </div>
            ))}
          </dl>
          <button type="button" className="ob-button-secondary" onClick={apply}>
            Confirm and use extracted numeric benefits
          </button>
          {confirmed && (
            <p role="status">
              Candidates applied. Review values below; remaining values are demo
              assumptions.
            </p>
          )}
        </div>
      )}
      {(
        [
          ["annual_maximum", "Annual benefit maximum ($)"],
          ["deductible", "Individual deductible ($)"],
          ["preventive", "Plan pays preventive (%)"],
          ["basic", "Plan pays basic (%)"],
          ["major", "Plan pays major (%)"],
        ] as const
      ).map(([key, label]) => {
        const pct = ["preventive", "basic", "major"].includes(key);
        return (
          <div className="ob-field" key={key}>
            <label htmlFor={`benefit-${key}`}>{label}</label>
            <input
              id={`benefit-${key}`}
              type="number"
              min="0"
              max={pct ? 100 : undefined}
              step={pct ? 1 : 0.01}
              value={pct ? Math.round(coverage[key] * 100) : coverage[key]}
              onChange={(e) =>
                on_change({
                  coverage: {
                    ...coverage,
                    [key]: Number(e.target.value) / (pct ? 100 : 1),
                  },
                })
              }
            />
          </div>
        );
      })}
      <div className="ob-field">
        <label htmlFor="benefit-start">Current benefit-year start</label>
        <input
          id="benefit-start"
          type="date"
          value={coverage.plan_year_start}
          onChange={(e) =>
            on_change({
              coverage: { ...coverage, plan_year_start: e.target.value },
            })
          }
        />
      </div>
      <h3>Current balances</h3>
      <p className="ob-muted">
        A coverage PDF does not establish current usage. Enter insurer payments
        used toward your annual maximum, not total dentist charges.
      </p>
      {(
        [
          ["as_of", "Balance date"],
          ["coverage_start", "Coverage start"],
          ["amount_used", "Insurer benefits used this year ($)"],
          ["deductible_met", "Deductible already met ($)"],
        ] as const
      ).map(([key, label]) => (
        <div className="ob-field" key={key}>
          <label htmlFor={`member-${key}`}>{label}</label>
          <input
            id={`member-${key}`}
            type={typeof member[key] === "number" ? "number" : "date"}
            min={typeof member[key] === "number" ? 0 : undefined}
            value={member[key]}
            onChange={(e) =>
              on_change({
                member: {
                  ...member,
                  [key]:
                    typeof member[key] === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                },
              })
            }
          />
        </div>
      ))}
    </section>
  );
}
