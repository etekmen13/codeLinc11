// The page as an ordered list of stops, derived from state. A stop is one
// screen: a narrated beat, or a content section. Stops after the first
// incomplete one (the gate) are not built, so the page ends at the gate.

import { closingFigures } from "../careplan/derive";
import { formatISODate } from "../lib/coverage";
import {
  carePlanKey,
  fresh,
  procedure,
  questions,
  requestKey,
  samplePlan,
  subscriberValid,
} from "../state/selectors";
import type { AppState } from "../state/store";
import {
  beats,
  reactions,
  simSummaryRiskyExpression,
  stateLabels,
  status,
  ui,
} from "./script";
import type { Expression, Reaction } from "./script";
import { fill, type Values } from "./template";

export type SectionId = keyof typeof ui.sections;

export const SECTION_ORDER = Object.keys(ui.sections) as SectionId[];

export type StopKind =
  | "beat"
  | "recap"
  | "sim_intro"
  | "sim_summary"
  | "providers"
  | "careplan"
  | "closing";

export interface OptionView {
  label: string;
  value: string;
  small?: boolean;
  reaction?: Reaction; // already filled
}

export interface BeatView {
  beatId: string;
  expression: Expression;
  line: string; // already filled
  options: OptionView[];
  selected?: string | null;
  input?: "subscriber" | "procedure";
  counter?: { n: number; total: number };
  status?: boolean; // a loading or error line, not a question
}

export interface Stop {
  id: string;
  section: SectionId;
  kind: StopKind;
  beat?: BeatView;
  complete: boolean;
}

function beat(
  id: string,
  values: Values = {},
  extra: Partial<BeatView> = {},
): BeatView {
  const b = beats[id];
  return {
    beatId: id,
    expression: b.expression,
    line: fill(b.line, values),
    options: (b.options ?? []).map((o) => ({
      label: o.label,
      value: o.value,
      small: o.small,
      reaction: o.reaction && {
        expression: o.reaction.expression,
        line: fill(o.reaction.line, values),
      },
    })),
    ...extra,
  };
}

// A line with no options, shown while something loads or after it fails.
function statusBeat(
  id: string,
  line: string,
  expression: Expression = "thinking",
): BeatView {
  return { beatId: id, expression, line, options: [], status: true };
}

export interface Flow {
  stops: Stop[];
  gateId: string | null; // first incomplete stop
}

export function buildFlow(s: AppState): Flow {
  const all: Stop[] = [];
  const a = s.answers;
  const push = (stop: Stop) => {
    all.push(stop);
    return stop.complete;
  };

  const done = (() => {
    if (
      !push({
        id: "intro",
        section: "opening",
        kind: "beat",
        beat: beat("intro"),
        complete: a.started,
      })
    )
      return;

    if (
      !push({
        id: "acute",
        section: "safety",
        kind: "beat",
        beat: beat("acute", {}, { selected: a.acute }),
        complete: a.acute === "no",
      })
    )
      return;

    // Insurer: needs the plan list.
    const form = s.form.data;
    if (!form) {
      push({
        id: "insurer",
        section: "intake",
        kind: "beat",
        beat: s.form.problems
          ? statusBeat("insurer", status.formError, "concerned")
          : statusBeat("insurer", status.loadingForm),
        complete: false,
      });
      return;
    }
    if (
      !push({
        id: "insurer",
        section: "intake",
        kind: "beat",
        beat: beat(
          "insurer",
          {},
          {
            selected: a.planId,
            options: form.plans.map(({ plan }) => ({
              label: `${plan.insurer} ${plan.plan_name}`,
              value: plan.id,
              reaction: {
                expression: reactions.insurer.expression,
                line: fill(reactions.insurer.line, {
                  planName: `${plan.insurer} ${plan.plan_name}`,
                }),
              },
            })),
          },
        ),
        complete: !!a.planId,
      })
    )
      return;

    if (
      !push({
        id: "subscriber",
        section: "intake",
        kind: "beat",
        beat: beat("subscriber", {}, { input: "subscriber" }),
        complete: a.subscriberConfirmed && subscriberValid(s),
      })
    )
      return;

    if (
      !push({
        id: "procedure",
        section: "intake",
        kind: "beat",
        beat: beat(
          "procedure",
          {},
          {
            input: "procedure",
            selected: a.procedureCode,
            options: form.procedures.map((p) => ({
              label: p.name,
              value: p.cdt_code,
              reaction: reactions.procedure,
            })),
          },
        ),
        complete: !!a.procedureCode,
      })
    )
      return;

    // Quiz: one stop per question.
    const qs = questions(s);
    if (!qs) {
      push({
        id: "quiz:loading",
        section: "quiz",
        kind: "beat",
        beat: s.questions.problems
          ? statusBeat("quiz", status.quizError, "concerned")
          : statusBeat("quiz", status.loadingQuiz),
        complete: false,
      });
      return;
    }
    for (const [i, q] of qs.entries()) {
      const answered = q.options.some((o) => o.id === a.quiz[q.id]);
      const ok = push({
        id: `quiz:${q.id}`,
        section: "quiz",
        kind: "beat",
        beat: {
          beatId: `quiz:${q.id}`,
          expression: "neutral",
          line: q.prompt,
          selected: a.quiz[q.id] ?? null,
          counter: { n: i + 1, total: qs.length },
          options: q.options.map((o) => {
            const pool = reactions.quiz[o.effect] ?? reactions.quiz.neutral;
            return {
              label: o.label,
              value: o.id,
              reaction: pool[i % pool.length],
            };
          }),
        },
        complete: answered,
      });
      if (!ok) return;
    }

    const key = requestKey(s);
    if (
      !push({
        id: "recap",
        section: "summary",
        kind: "recap",
        complete: fresh(s.onboarding, key) !== null,
      })
    )
      return;

    const proc = procedure(s);
    if (
      !push({
        id: "tooth",
        section: "tooth",
        kind: "beat",
        beat: beat("tooth_done", {
          currentStateLabel: proc ? stateLabels[proc.treats_state] : "",
        }),
        complete: a.toothDone,
      })
    )
      return;

    const sim = fresh(s.simulation, key);
    if (
      !push({
        id: "sim_intro",
        section: "simulation",
        kind: "sim_intro",
        beat: sim
          ? beat("sim_intro", {
              months: sim.horizon,
              futures: sim.n_samples.toLocaleString(),
            })
          : s.simulation.problems
            ? statusBeat(
                "sim_intro",
                fill(status.simulationError, {
                  problems: s.simulation.problems.join(" "),
                }),
                "concerned",
              )
            : statusBeat("sim_intro", status.thinking),
        complete: !!sim && a.simIntroDone,
      })
    )
      return;

    if (
      !push({
        id: "sim_summary",
        section: "simulation",
        kind: "sim_summary",
        beat: simSummaryBeat(sim!),
        complete: a.simSummaryDone,
      })
    )
      return;

    if (
      !push({
        id: "providers",
        section: "providers",
        kind: "providers",
        complete: !!s.providerId,
      })
    )
      return;

    if (
      !push({
        id: "careplan",
        section: "careplan",
        kind: "careplan",
        complete: fresh(s.carePlan, carePlanKey(s)) !== null,
      })
    )
      return;

    const plan = samplePlan(s);
    const figures = closingFigures(s);
    push({
      id: "closing",
      section: "closing",
      kind: "closing",
      beat: beat(
        figures && figures.unused < 1 ? "closing_reset" : "closing_reminder",
        {
          unusedBenefits: figures?.unusedLabel,
          expiryDate: figures && formatISODate(figures.expiry),
          annualMaximum: figures?.annualMaximumLabel,
          resetDate: figures && formatISODate(figures.resetsOn),
          preventivePct:
            plan && Math.round(plan.plan.coinsurance.preventive * 100),
        },
      ),
      complete: true,
    });
    push({
      id: "closing_end",
      section: "closing",
      kind: "beat",
      beat: beat("closing_end"),
      complete: true,
    });
    return true;
  })();

  const gate = done ? null : all[all.length - 1];
  return { stops: all, gateId: gate && !gate.complete ? gate.id : null };
}

function simSummaryBeat(
  sim: NonNullable<AppState["simulation"]["data"]>,
): BeatView {
  const start = sim.states.indexOf(sim.start_state);
  if (start >= sim.states.length - 1) return beat("sim_summary_terminal");
  const low = sim.risk_bands[0]?.name;
  const view = beat("sim_summary", {
    lowRiskUntilDate: formatISODate(
      sim.month_dates[sim.summary.low_risk_until_month],
    ),
    horizonDate: formatISODate(sim.month_dates[sim.horizon]),
    nextStateLabel: stateLabels[sim.states[start + 1]],
    riskPct: Math.round(sim.summary.risk_at_horizon * 100),
  });
  if (sim.summary.bands[sim.horizon] !== low)
    view.expression = simSummaryRiskyExpression;
  return view;
}
