// Figures the care plan, meter and closing show, derived from backend data.

import { formatMoney, parseISODate } from "../lib/coverage";
import { fresh, procedure, samplePlan } from "../state/selectors";
import type { AppState } from "../state/store";
import type {
  CarePlan,
  CarePlanOption,
  CarePlanOutcome,
  InsuranceType,
  Procedure,
} from "../types";
import { chosenPlan, timingPlans, type TimingPlan } from "./timing";

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// Expected plan payment for an option, averaged over the tooth's futures.
export function expectedPlanPays(option: CarePlanOption): number {
  return option.outcomes.reduce(
    (s, o) => s + o.probability * o.visit.plan_pays,
    0,
  );
}

// The outcome where the tooth still needs the procedure the member picked,
// else the most likely one. The waterfall prices this one.
export function mainOutcome(
  option: CarePlanOption,
  startState: string,
): CarePlanOutcome {
  return (
    option.outcomes.find((o) => o.visit.tooth_state === startState) ??
    option.outcomes[0]
  );
}

export type StepKey =
  | "fee"
  | "discount"
  | "cashDiscount"
  | "cash"
  | "balance"
  | "deductible"
  | "planShare"
  | "yourShare"
  | "overMax"
  | "denied"
  | "owed";

export interface Step {
  key: StepKey;
  amount: number;
  start: number; // offset along the fee bar
  who: "total" | "you" | "plan" | "gap" | "waived";
  term?: string; // script key of the margin note
}

// The visit's bill broken into steps that add up: fee = network discount +
// what you owe + what the plan pays. Mirrors cost.py: in network, the
// amount above the negotiated fee is waived; out of network, it is billed to
// you. The plan pays its coinsurance on the allowed amount after the
// deductible, capped at the remaining maximum.
export function waterfall(
  outcome: CarePlanOutcome,
  procedures: Procedure[],
  coinsurance: Record<InsuranceType, number>,
): Step[] {
  let fee = 0,
    discount = 0,
    balance = 0,
    deductible = 0,
    yourShare = 0,
    planShare = 0,
    overMax = 0,
    denied = 0,
    cashDiscount = 0,
    cash = 0,
    owed = 0;
  let deniedReason: string | null = null;
  for (const l of outcome.visit.lines) {
    fee += l.provider_fee;
    owed += l.you_pay;
    // Cash: the dentist's self-pay price replaces insurance entirely.
    if (l.path === "cash") {
      cashDiscount += l.provider_fee - l.you_pay;
      cash += l.you_pay;
      continue;
    }
    // In network, the plan's price applies even when the claim is denied.
    if (l.in_network) discount += l.provider_fee - l.allowed_amount;
    if (l.denial_reason) {
      denied += l.you_pay;
      deniedReason = l.denial_reason;
      continue;
    }
    const category = procedures.find(
      (p) => p.cdt_code === l.cdt_code,
    )?.category;
    const c = category ? coinsurance[category] : 0;
    const base = l.allowed_amount - l.deductible_applied;
    const fullShare = Math.round(base * c * 100) / 100;
    const yours = base - fullShare;
    balance += l.balance_billing;
    deductible += l.deductible_applied;
    yourShare += yours;
    planShare += l.plan_pays;
    overMax += Math.max(
      0,
      l.you_pay - l.balance_billing - l.deductible_applied - yours,
    );
  }

  const steps: Step[] = [{ key: "fee", amount: fee, start: 0, who: "total" }];
  let at = 0;
  const add = (
    key: StepKey,
    amount: number,
    who: Step["who"],
    term?: string,
  ) => {
    if (amount < 0.005) return;
    steps.push({ key, amount, start: at, who, term });
    at += amount;
  };
  add("cashDiscount", cashDiscount, "waived", "term_cash");
  add("cash", cash, "you", "term_cash");
  add("discount", discount, "waived", "term_network_discount");
  add("balance", balance, "gap", "term_balance_billing");
  add("deductible", deductible, "you", "term_deductible");
  add("yourShare", yourShare, "you");
  add("overMax", overMax, "you", "term_annual_max");
  add(
    "denied",
    denied,
    "you",
    deniedReason === "waiting_period"
      ? "term_waiting_period"
      : "term_frequency_limit",
  );
  add("planShare", planShare, "plan", "term_coinsurance");
  steps.push({ key: "owed", amount: owed, start: 0, who: "total" });
  return steps;
}

export interface CarePlanView {
  data: CarePlan;
  plans: TimingPlan[];
  chosen: TimingPlan;
  resetsOn: string; // first day of the next plan year
}

export function carePlanView(s: AppState): CarePlanView | null {
  const data = s.carePlan.data;
  if (!data || !s.providerId || data.provider_id !== s.providerId) return null;
  const plans = timingPlans(data);
  return {
    data,
    plans,
    chosen: chosenPlan(plans, s.timingId),
    resetsOn: data.maximum[0]?.resets_on ?? addDays(data.as_of, 365),
  };
}

export interface MeterFigures {
  max: number;
  used: number;
  scheduled: number; // expected plan payments this plan year, chosen timing
  remaining: number;
  resetsOn: string | null;
}

export function meterFigures(s: AppState): MeterFigures | null {
  const sample = samplePlan(s);
  if (!sample) return null;
  const max = sample.plan.annual_maximum;
  const used = Math.min(max, sample.default_member.amount_used);
  const view = carePlanView(s);
  const scheduled = view
    ? view.chosen.placements
        .filter((p) => p.date < view.resetsOn)
        .reduce((sum, p) => sum + expectedPlanPays(p.option), 0)
    : 0;
  return {
    max,
    used,
    scheduled: Math.min(scheduled, max - used),
    remaining: Math.max(0, max - used - scheduled),
    resetsOn: view?.resetsOn ?? null,
  };
}

export interface ClosingFigures {
  unused: number;
  unusedLabel: string;
  expiry: string; // ISO, last day of this plan year
  resetsOn: string; // ISO, first day of the next plan year
  annualMaximumLabel: string; // what the reset brings back
  // FSA money forfeited at the spending deadline; 0 if none.
  fsaForfeited: number;
  fsaDeadline: string | null;
}

// What expires at the reset if care follows the chosen timing.
export function closingFigures(s: AppState): ClosingFigures | null {
  const meter = meterFigures(s);
  const view = carePlanView(s);
  if (!meter || !view) return null;
  const fsa = view.data.reminders.find((r) => r.kind === "fsa_forfeited");
  return {
    unused: meter.remaining,
    unusedLabel: formatMoney(meter.remaining),
    expiry: addDays(view.resetsOn, -1),
    resetsOn: view.resetsOn,
    annualMaximumLabel: formatMoney(meter.max),
    fsaForfeited: fsa?.amount ?? 0,
    fsaDeadline: fsa?.deadline ?? null,
  };
}

// Convenience for components that need the chosen procedure's start state.
export function startState(s: AppState): string | null {
  return (
    procedure(s)?.treats_state ??
    fresh(s.onboarding, s.onboarding.key)?.start_state ??
    null
  );
}
