// Timing plans: ways to place care on the plan-year timeline.
//
// A plan is a list of placements, each a priced option on one date. In v0
// every plan has one placement, because the sequencer prices the whole
// procedure on one date ("now", "after the reset", or the lowest-cost
// date). Splitting a bundle across the reset (root canal before, crown
// after) becomes a plan with two placements; the timing columns already
// show any number of them, and plan totals below are sums over placements.

import type { CarePlan, CarePlanOption } from "../types";
import { owed } from "./derive";

export type TimingId = "now" | "after_reset" | "lowest";

export interface Placement {
  date: string; // ISO date
  option: CarePlanOption;
}

export interface TimingPlan {
  id: TimingId;
  placements: Placement[];
  owed: number; // expected amount owed to the dentist, summed over placements
  fromFsa: number; // the part of `owed` the FSA would pay
  escalation: number; // chance the tooth is worse by the last placement
  savingsVsNow: number; // "now" plan's amount owed minus this one's
  isLowest: boolean; // contains the lowest-cost option in tolerance
}

const same = (a: CarePlanOption, b: CarePlanOption) =>
  a.date === b.date && a.path === b.path;

function plan(
  id: TimingId,
  options: CarePlanOption[],
  data: CarePlan,
): TimingPlan {
  const placements = options.map((option) => ({ date: option.date, option }));
  const total = options.reduce((sum, o) => sum + owed(o).total, 0);
  return {
    id,
    placements,
    owed: total,
    fromFsa: options.reduce((sum, o) => sum + owed(o).fromFsa, 0),
    escalation: Math.max(...options.map((o) => o.escalation_probability)),
    savingsVsNow: owed(data.baseline).total - total,
    isLowest: options.some((o) => same(o, data.lowest_cost)),
  };
}

// The plans to offer, in date order: now, after the reset, and the lowest
// cost option if it is neither.
export function timingPlans(data: CarePlan): TimingPlan[] {
  const plans = [plan("now", [data.baseline], data)];
  const afterReset =
    data.options.find(
      (o) => o.labels.includes("after_plan_reset") && o.path === "insured",
    ) ?? data.options.find((o) => o.labels.includes("after_plan_reset"));
  if (afterReset && !same(afterReset, data.baseline))
    plans.push(plan("after_reset", [afterReset], data));
  if (!plans.some((p) => p.isLowest))
    plans.push(plan("lowest", [data.lowest_cost], data));
  return plans.sort((a, b) =>
    a.placements[0].date.localeCompare(b.placements[0].date),
  );
}

// The chosen plan, or the one holding the lowest-cost option.
export function chosenPlan(plans: TimingPlan[], id: string | null): TimingPlan {
  return (
    plans.find((p) => p.id === id) ?? plans.find((p) => p.isLowest) ?? plans[0]
  );
}
