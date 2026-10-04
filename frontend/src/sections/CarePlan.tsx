// Care plan: one focal number, the timeline with its reset seam, and the
// bill as a waterfall. Everything else is one "Details" away.

import { useState } from "react";
import { displayText } from "../lib/displayText";
import {
  carePlanView,
  mainOutcome,
  meterFigures,
  waterfall,
} from "../careplan/derive";
import { Timeline } from "../careplan/Timeline";
import { Waterfall } from "../careplan/Waterfall";
import { useExplanation } from "../hooks/useExplanation";
import {
  addMonths,
  formatISODate,
  formatMoney,
  isInWaitingPeriod,
  parseISODate,
  waitingPeriodEnds,
} from "../lib/coverage";
import { lever_label, option_labels, tooth_state_label } from "../lib/labels";
import { procedurePhrases, ui } from "../narrative/script";
import { fill } from "../narrative/template";
import { carePlanKey, fresh, procedure, samplePlan } from "../state/selectors";
import { useStore, type AppState } from "../state/store";
import { isoDate, owed } from "../careplan/derive";
import { bandColor } from "../lib/risk";
import type { CarePlan as CarePlanData, CarePlanOption } from "../types";

const pct = (p: number) => Math.round(p * 100);
const monthsLater = (iso: string, months: number) =>
  isoDate(addMonths(parseISODate(iso), months));

export function CarePlan() {
  const state = useStore((s) => s);
  const view = carePlanView(state);
  const remote = useStore((s) => s.carePlan);
  const ready = useStore((s) => fresh(s.carePlan, carePlanKey(s)) !== null);
  const sample = samplePlan(state);
  const proc = procedure(state);
  const quotes = state.comparison.data?.quotes ?? [];
  const provider = quotes.find((q) => q.id === state.providerId);
  const [details, setDetails] = useState(false);
  const [explain, setExplain] = useState(false);

  const bill =
    view && sample && proc
      ? billFor(state, view.chosen.placements[0].option)
      : null;
  const costExplanation = useExplanation(
    "/api/care-plan/explain",
    explain && bill ? JSON.stringify(bill.explainBody) : null,
  );

  if (!view || !sample || !proc) {
    return (
      <div className="careplan" aria-live="polite">
        {remote.loading && <p className="quiet">{ui.careplan.loading}</p>}
        {remote.problems && (
          <p role="alert">
            {fill(ui.careplan.error, { problems: remote.problems.join(" ") })}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => state.patch({ retry: state.retry + 1 })}
            >
              {ui.careplan.retry}
            </button>
          </p>
        )}
      </div>
    );
  }

  const { data, plans, chosen, resetsOn } = view;
  const option = chosen.placements[0].option;
  const plan = sample.plan;
  const member = sample.default_member;
  const afterReset = chosen.placements[0].date >= resetsOn;
  const savings = chosen.savingsVsNow;
  const timingNote =
    chosen.id === "now" || Math.abs(savings) < 0.5
      ? fill(ui.careplan.timingNow, { resetDate: formatISODate(resetsOn) })
      : fill(savings > 0 ? ui.careplan.timingSaves : ui.careplan.timingCosts, {
          resetDate: formatISODate(resetsOn),
          yearPhrase: afterReset ? ui.careplan.nextYear : ui.careplan.thisYear,
          savings: formatMoney(Math.abs(savings)),
          riskPct: pct(chosen.escalation),
        });
  const waiting = isInWaitingPeriod(plan, member, proc.category);

  return (
    <div className="careplan" data-loading={!ready}>
      <header className="careplan__head">
        <p className="figure figure--xl tabular">{formatMoney(chosen.owed)}</p>
        <p className="quiet">
          {fill(ui.careplan.headlineNote, {
            provider: provider?.name ?? data.provider_id,
            timing: ui.careplan.timings[chosen.id],
          })}
          {chosen.fromFsa >= 0.5 &&
            ` · ${
              chosen.owed - chosen.fromFsa < 0.5
                ? ui.providers.allFsa
                : fill(ui.providers.fromFsa, {
                    amount: formatMoney(chosen.fromFsa),
                  })
            }`}
        </p>
      </header>

      <Timeline
        asOf={data.as_of}
        resetsOn={resetsOn}
        plans={plans}
        chosen={chosen}
        procedureCode={proc.cdt_code}
        onChoose={(id) => state.patch({ timingId: id })}
      />

      <div className="careplan__compare">
        <div className="figure-block">
          <p className="figure tabular">{formatMoney(Math.abs(savings))}</p>
          <p className="quiet">
            {Math.abs(savings) < 0.5
              ? ui.careplan.sameCost
              : savings > 0
                ? ui.careplan.saves
                : ui.careplan.costsMore}
          </p>
        </div>
        <div className="figure-block">
          <p
            className="figure tabular"
            style={{ color: bandColor(option.band, data.risk_bands) }}
          >
            {pct(chosen.escalation)}%
          </p>
          <p className="quiet">{ui.careplan.worseFirst}</p>
        </div>
        <p className="margin-note careplan__timing-note">{timingNote}</p>
      </div>

      {bill && (
        <div className="careplan__bill">
          <Waterfall
            steps={bill.steps}
            notes={bill.notes}
            explainBodies={bill.explainBodies}
          />
          <p className="careplan__explain">
            {!explain && (
              <button
                type="button"
                className="text-link"
                onClick={() => setExplain(true)}
              >
                {ui.careplan.explainCost}
              </button>
            )}
            {costExplanation.loading && (
              <span className="quiet">{ui.careplan.explaining}</span>
            )}
            {costExplanation.text && (
              <span className="margin-note">
                {displayText(costExplanation.text)}
              </span>
            )}
            {costExplanation.error && (
              <span className="quiet">
                {displayText(costExplanation.error)}
              </span>
            )}
          </p>
          {waiting && (
            <p className="margin-note">
              {fill(ui.terms.term_waiting_period, {
                category: proc.category,
                waitingMonths: plan.waiting_period_months[proc.category],
                eligibleDate: formatISODate(
                  isoDate(waitingPeriodEnds(plan, member, proc.category)),
                ),
              })}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="text-link careplan__details-toggle"
        aria-expanded={details}
        onClick={() => setDetails((d) => !d)}
      >
        {details ? ui.careplan.hideDetails : ui.careplan.details}
      </button>
      {details && <Details data={data} />}

      <p className="fine-print">{ui.careplan.disclaimer}</p>
    </div>
  );
}

// The waterfall and its notes for one option, on its main outcome.
function billFor(s: AppState, option: CarePlanOption) {
  const sample = samplePlan(s)!;
  const proc = procedure(s)!;
  const view = carePlanView(s)!;
  const meter = meterFigures(s);
  const plan = sample.plan;
  const member = sample.default_member;
  const outcome = mainOutcome(option, proc.treats_state);
  const steps = waterfall(
    outcome,
    s.form.data?.procedures ?? [],
    plan.coinsurance,
  );
  const lines = outcome.visit.lines;
  const sum = (f: (l: (typeof lines)[number]) => number) =>
    lines.reduce((a, l) => a + f(l), 0);
  const afterReset = option.date >= view.resetsOn;
  const resetDate = afterReset ? monthsLater(view.resetsOn, 12) : view.resetsOn;
  const limit = plan.frequency_limits.find((f) => f.cdt_code === proc.cdt_code);
  const lastService = [...member.past_services]
    .reverse()
    .find((p) => p.cdt_code === proc.cdt_code);
  const remainingMax = afterReset
    ? plan.annual_maximum
    : Math.max(0, plan.annual_maximum - member.amount_used);

  const notes: Record<string, string> = {
    term_deductible: fill(ui.terms.term_deductible, {
      deductibleMet: formatMoney(afterReset ? 0 : member.deductible_met),
      deductible: formatMoney(plan.deductible),
    }),
    term_coinsurance: fill(ui.terms.term_coinsurance, {
      category: proc.category,
      coveragePct: pct(plan.coinsurance[proc.category]),
    }),
    term_annual_max: fill(ui.terms.term_annual_max, {
      remainingMax: formatMoney(remainingMax),
      resetDate: formatISODate(resetDate),
    }),
    term_network_discount: fill(ui.terms.term_network_discount, {
      allowedAmount: formatMoney(
        sum((l) => (l.in_network ? l.allowed_amount : 0)),
      ),
      discount: formatMoney(
        sum((l) => (l.in_network ? l.provider_fee - l.allowed_amount : 0)),
      ),
      fee: formatMoney(sum((l) => (l.in_network ? l.provider_fee : 0))),
    }),
    term_balance_billing: fill(ui.terms.term_balance_billing, {
      allowedAmount: formatMoney(sum((l) => l.allowed_amount)),
      fee: formatMoney(sum((l) => l.provider_fee)),
      gap: formatMoney(sum((l) => l.balance_billing)),
    }),
    term_waiting_period: fill(ui.terms.term_waiting_period, {
      category: proc.category,
      waitingMonths: plan.waiting_period_months[proc.category],
      eligibleDate: formatISODate(
        isoDate(waitingPeriodEnds(plan, member, proc.category)),
      ),
    }),
    term_cash: ui.terms.term_cash,
  };
  if (limit) {
    const next = lastService
      ? monthsLater(lastService.date_of_service, limit.per_months)
      : option.date;
    notes.term_frequency_limit = fill(ui.terms.term_frequency_limit, {
      frequencyLimit: fill(ui.terms.frequency, {
        count: limit.count,
        months: limit.per_months,
      }),
      nextEligibleDate: formatISODate(next),
    });
  }

  const context = {
    procedure: proc.name,
    category: proc.category,
    annual_deductible: plan.deductible,
    deductible_met: member.deductible_met,
    deductible_applies: plan.deductible_applies_to.includes(proc.category),
    plan_share: plan.coinsurance[proc.category],
    annual_maximum: plan.annual_maximum,
    amount_used: member.amount_used,
    waiting_period_months: plan.waiting_period_months[proc.category],
    in_waiting_period: isInWaitingPeriod(plan, member, proc.category),
    in_network: lines[0]?.in_network ?? null,
    deductible_applied_to_estimate: sum((l) => l.deductible_applied),
    balance_billing: sum((l) => l.balance_billing),
  };
  const explainBodies = Object.fromEntries(
    Object.entries(ui.termApiNames).map(([key, term]) => [
      key,
      { term, context },
    ]),
  );

  return {
    steps,
    notes,
    explainBodies,
    explainBody: {
      cdt_code: proc.cdt_code,
      procedure: lines.map((l) => l.procedure_name).join(" + ") || proc.name,
      provider: lines[0]?.provider_name ?? "",
      in_network: lines[0]?.in_network ?? true,
      provider_fee: sum((l) => l.provider_fee),
      deductible_applied: sum((l) => l.deductible_applied),
      plan_pays: sum((l) => l.plan_pays),
      you_pay: sum((l) => l.you_pay),
      balance_billing: sum((l) => l.balance_billing),
      annual_maximum_remaining: meter?.remaining ?? remainingMax,
    },
  };
}

// Everything v0 showed beyond the essentials, behind one disclosure.
function Details({ data }: { data: CarePlanData }) {
  const h = ui.careplan.detailHeads;
  const path = (p: string) => ui.paths[p] ?? p;
  return (
    <div className="careplan__details">
      <section>
        <h3>{h.options}</h3>
        <ul className="plain-list">
          {data.options.map((o) => (
            <li key={`${o.date}-${o.path}`}>
              <details>
                <summary className="tabular">
                  {fill(ui.careplan.optionRow, {
                    date: formatISODate(o.date),
                    path: path(o.path),
                    cost: formatMoney(owed(o).total),
                    risk: pct(o.escalation_probability),
                  })}
                  <span className="quiet"> · {option_labels(o.labels)}</span>
                </summary>
                <ul className="plain-list quiet">
                  {o.outcomes.map((out, i) => (
                    <li key={i} className="tabular">
                      {fill(ui.careplan.outcomeRow, {
                        pct: pct(out.probability),
                        state: tooth_state_label(out.visit.tooth_state),
                        procedures:
                          out.visit.lines
                            .map(
                              (l) =>
                                procedurePhrases[l.cdt_code] ??
                                l.procedure_name,
                            )
                            .join(", ") || ui.careplan.noTreatment,
                        youPay: formatMoney(out.visit.you_pay),
                      })}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{h.levers}</h3>
        <ul className="plain-list tabular">
          {Object.entries(data.lever_savings).map(([k, v]) => (
            <li key={k}>
              {fill(ui.careplan.lever, {
                name: lever_label(k),
                amount: formatMoney(v),
              })}
            </li>
          ))}
        </ul>
      </section>

      {data.beyond_tolerance && (
        <section>
          <h3>{h.riskier}</h3>
          <p>
            {fill(ui.careplan.riskier, {
              date: formatISODate(data.beyond_tolerance.date),
              path: path(data.beyond_tolerance.path),
              cost: formatMoney(owed(data.beyond_tolerance).total),
              extra: formatMoney(data.beyond_tolerance_savings?.mean ?? 0),
              risk: pct(data.beyond_tolerance.escalation_probability),
            })}
          </p>
        </section>
      )}

      {data.fsa && (
        <section>
          <h3>{h.fsa}</h3>
          <p className="tabular">
            {fill(ui.careplan.fsaLine, {
              balance: formatMoney(data.fsa.balance),
              deadline: formatISODate(data.fsa.spend_deadline),
              unused: formatMoney(data.fsa.unused),
              forfeited: formatMoney(data.fsa.forfeited),
            })}
          </p>
          {data.fsa.election > 0 && (
            <p className="tabular">
              {fill(ui.careplan.fsaElection, {
                amount: formatMoney(data.fsa.election),
              })}
            </p>
          )}
        </section>
      )}

      <section>
        <h3>{h.maximum}</h3>
        <ul className="plain-list tabular">
          {data.maximum.map((m) => (
            <li key={m.plan_year_start}>
              {fill(ui.careplan.maximumLine, {
                start: formatISODate(m.plan_year_start),
                reset: formatISODate(m.resets_on),
                used: formatMoney(m.used),
                scheduled: formatMoney(m.scheduled),
                remaining: formatMoney(m.remaining),
              })}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{h.assumptions}</h3>
        <ul className="plain-list quiet">
          {data.assumptions.map((a) => (
            <li key={a}>{displayText(a)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
