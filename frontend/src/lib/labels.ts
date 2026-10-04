// Plain-language text for the codes the backend sends. Descriptive only:
// the app lays out options and their costs, it does not recommend care.

import type { PaymentPath, Reminder, RiskBand } from "../types";

// Why a date was priced (CarePlanOption.labels).
const OPTION_LABELS: Record<string, string> = {
  earliest: "Earliest date",
  before_plan_reset: "Two weeks before the plan year resets",
  after_plan_reset: "Just after the plan year resets",
  waiting_period_ends: "When the waiting period ends",
  frequency_limit_clears: "When the frequency limit allows it again",
  fsa_deadline: "Last day to spend this year's FSA money",
};

export function option_label(label: string): string {
  // last_month_<band>_risk, for every band but the last
  const band = /^last_month_(.+)_risk$/.exec(label);
  if (band) return `Last month at ${band[1]} risk`;
  return OPTION_LABELS[label] ?? label;
}

export function option_labels(labels: string[]): string {
  return labels.map(option_label).join("; ");
}

export const REMINDER_KINDS: Record<Reminder["kind"], string> = {
  annual_maximum_expires: "Unused annual maximum",
  fsa_forfeited: "FSA money that would be forfeited",
  cleaning_covered: "A cleaning the plan still covers",
};

// What each planning lever adds to the savings (CarePlan.lever_savings).
const LEVERS: Record<string, string> = {
  timing: "Choosing the date",
  cash: "Paying the dentist's cash price",
  fsa_planning: "Planning FSA money, including next year's election",
};

export function lever_label(lever: string): string {
  return LEVERS[lever] ?? lever;
}

const TOOTH_STATES: Record<string, string> = {
  healthy: "Healthy",
  early_lesion: "Early lesion",
  cavity: "Cavity",
  root_canal: "Root canal stage",
  extraction: "Extraction stage",
};

export function tooth_state_label(state: string): string {
  return TOOTH_STATES[state] ?? state;
}

export const PAYMENT_PATHS: Record<PaymentPath, string> = {
  insured: "Through insurance",
  cash: "Cash price",
};

export const DENIAL_REASONS: Record<string, string> = {
  waiting_period: "Waiting period",
  frequency_limit: "Frequency limit",
};

function percent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

// "Low (under 10%)", "Medium (10% to 25%)", "High (25% or more)": the
// chance the tooth is worse than it is now.
export function band_label(name: string, bands: RiskBand[]): string {
  const i = bands.findIndex((b) => b.name === name);
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  if (i < 0) return title;
  const lower = i > 0 ? bands[i - 1].upper : null;
  const upper = bands[i].upper;
  if (lower === null && upper !== null)
    return `${title} (under ${percent(upper)})`;
  if (lower !== null && upper !== null)
    return `${title} (${percent(lower)} to ${percent(upper)})`;
  if (lower !== null) return `${title} (${percent(lower)} or more)`;
  return title;
}
