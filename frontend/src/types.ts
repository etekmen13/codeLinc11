export type InsuranceType = "preventive" | "basic" | "major";

// Progression states for the risk model
export type ToothState =
  "healthy" | "early_lesion" | "cavity" | "root_canal" | "extraction";

export interface FrequencyLimit {
  cdt_code: string;
  count: number;
  per_months: number;
}

// Policy Terms.
export interface Plan {
  id: string;
  insurer: string;
  plan_name: string;
  annual_maximum: number;
  deductible: number;
  deductible_applies_to: InsuranceType[];
  coinsurance: Record<InsuranceType, number>;
  waiting_period_months: Record<InsuranceType, number>;
  frequency_limits: FrequencyLimit[];
  plan_year_start: string; // ISO date the reset date is one year later
  in_network_fees: Record<string, number>; // CDT code, negotiated fee
  out_of_network_allowed: Record<string, number>; // CDT code, allowed amount
  subscriber_id_pattern: string;
  subscriber_id_example: string;
}

export interface PastService {
  cdt_code: string;
  date_of_service: string; // ISO date
}

// Health flexible spending account: pre-tax money for the member's share.
// Separate from the dental plan, so it never changes what the plan pays.
export interface Fsa {
  balance: number; // unspent this FSA year, as of the member's as_of
  year_end: string; // ISO date, last day of this FSA year
  grace_period_end: string | null; // ISO date; a plan has this or carryover
  carryover_limit: number; // unspent dollars kept for next year; 0 = none
  election_limit: number; // most the member can elect for a year
  marginal_tax_rate: number; // what a pre-tax dollar saves
}

export interface MemberStatus {
  subscriber_id: string;
  as_of: string; // ISO date the balances describe; the backend's "today"
  coverage_start: string; // ISO date, waiting periods count from here
  amount_used: number; // this plan year
  deductible_met: number; // this plan year
  past_services: PastService[]; // oldest first; frequency limits count these
  fsa: Fsa | null; // null if the employer offers no FSA
}

export interface Procedure {
  cdt_code: string;
  name: string;
  description: string;
  category: InsuranceType;
  typical_fee: number;
  treats_state: ToothState;
}

export interface SamplePlan {
  plan: Plan;
  default_member: Omit<MemberStatus, "subscriber_id">;
}

export interface QuizOption {
  id: string;
  label: string;
  effect: "lowers" | "raises" | "neutral"; // direction of risk, for tone only
}

// The backend filters questions by procedure, so none carry applies_to.
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export type QuizAnswers = Record<string, string>; // question id, option id

// What POST /api/onboarding returns.
export interface OnboardingResult {
  plan: Plan;
  member: MemberStatus;
  procedure: Procedure;
  quiz_answers: QuizAnswers;
  start_state: ToothState;
  hazard_multipliers: Record<string, number>; // "a->b" edge, multiplier
}

// One procedure at one dentist on the insured path, in dollars.
export interface ProviderCost {
  procedure: string; // CDT code
  provider: string;
  in_network: boolean;
  provider_fee: number;
  deductible_applied: number;
  plan_pays: number;
  you_pay: number;
  balance_billing: number;
  annual_maximum_remaining: number;
  allowed_amount: number;
  covered: boolean;
  denial_reason: "waiting_period" | "frequency_limit" | null;
  cash_price: number | null; // null if the dentist has no self-pay price
  explanation: string[]; // one sentence per pricing step
  assumptions: string[];
}

export interface ProviderCard {
  id: string;
  name: string;
  distance_miles: number;
  credentials: string[];
  in_network: boolean;
  cost: ProviderCost;
}

// GET /api/providers/nearby: closest dentists, unpriced, nearest first.
export interface NearbyProvider {
  id: string;
  name: string;
  distance_miles: number;
  credentials: string[];
}

// POST /api/cdt/map: a treatment description matched to catalog codes.
export interface CdtMapping {
  status: "candidate" | "needs_clarification" | "no_match";
  candidate_codes: { code: string; reason: string }[];
  clarification_question: string | null;
  // "keywords" when the server has no AI model configured, or it failed
  matched_by?: "model" | "keywords";
}

// What POST /api/providers returns; each column sorted by you_pay.
export interface ProvidersResult {
  procedure: string;
  date_of_service: string; // ISO date
  in_network: ProviderCard[];
  out_of_network: ProviderCard[];
}

// Care plan: POST /api/care-plan/sequence. Amounts are in dollars; expected
// values are averages over simulated futures.

export type PaymentPath = "insured" | "cash";

export interface RiskBand {
  name: string;
  upper: number | null; // escalation probability below this; null = no limit
}

export interface BandSegment {
  band: string;
  start_month: number;
  end_month: number; // inclusive
}

// How the untreated tooth may progress, month by month from as_of.
export interface RiskSummary {
  low_risk_until_month: number; // last month risk stays in the lowest band
  band_limits: RiskBand[];
  bands: string[]; // band name for each month 0..horizon
  band_ranges: Record<string, BandSegment | null>;
  band_segments: BandSegment[];
  risk_at_low_risk_until: number;
  risk_at_horizon: number;
  worst_state_at_horizon: number;
}

// POST /api/simulation: the reporting simulation the care plan endpoints
// use, so summary matches their risk field for the same request.
export interface ToothSimulation {
  as_of: string; // ISO date, month 0
  start_state: string;
  states: string[]; // best to worst; indexes dist and sample_paths
  horizon: number; // months after as_of
  n_samples: number; // futures simulated
  month_dates: string[]; // ISO dates, as_of plus m months for m in 0..horizon
  dist: number[][]; // [month][state]: share of futures in that state
  risk: number[]; // [month]: share of futures worse than start_state
  summary: RiskSummary;
  risk_bands: RiskBand[];
  sample_paths: number[][]; // [future][month]: state index; a random sample
}

export interface CarePlanLine {
  cdt_code: string;
  procedure_name: string;
  provider_id: string; // differs from the chosen dentist for a referral
  provider_name: string;
  in_network: boolean;
  path: PaymentPath;
  provider_fee: number; // what the dentist bills
  allowed_amount: number; // what the plan recognizes
  deductible_applied: number; // 0 for cash
  plan_pays: number;
  you_pay: number;
  balance_billing: number; // billed minus allowed, out of network; 0 for cash
  denial_reason: "waiting_period" | "frequency_limit" | null;
}

export interface CarePlanVisit {
  date: string; // ISO date
  tooth_state: ToothState;
  lines: CarePlanLine[]; // billing order; empty if nothing is needed
  plan_pays: number;
  you_pay: number;
}

// One tooth state the futures can reach by an option's date.
export interface CarePlanOutcome {
  probability: number;
  visit: CarePlanVisit;
}

export interface CostStats {
  mean: number;
  p5: number;
  p95: number;
  cvar95: number; // mean of the costliest 5% of futures
}

export interface FsaSummary {
  election: number; // for the option's FSA year; 0 if this year or none
  from_balance: number;
  from_election: number;
  balance_unused: number;
  forfeited: number;
}

// A date and payment path for the procedure, priced across futures.
export interface CarePlanOption {
  date: string; // ISO date
  path: PaymentPath;
  labels: string[]; // why the date was priced, e.g. "after_plan_reset"
  month: number; // simulation month the date falls in
  escalation_probability: number; // chance the tooth is worse by the date
  band: string;
  outcomes: CarePlanOutcome[]; // most likely first
  member_share: CostStats; // what the member owes the dentists
  cost: CostStats; // after FSA and tax: what options are compared on
  fsa: FsaSummary;
}

// Baseline's cost minus an option's, paired future by future.
export interface Savings {
  mean: number;
  p5: number;
  p95: number;
  probability_costs_more: number; // share of futures where it costs more
}

export interface MaximumUsage {
  plan_year_start: string; // ISO date
  resets_on: string; // ISO date, first day of the next plan year
  annual_maximum: number;
  used: number; // by claims before the visit
  scheduled: number; // expected plan payment for the visit
  remaining: number;
}

export interface FsaTracker {
  balance: number;
  spend_deadline: string; // ISO date
  carryover_limit: number;
  spent: number;
  unused: number;
  forfeited: number; // lost at the deadline; the rest carries over
  election: number; // lowest expected cost for the visit's FSA year
  election_quantile: number; // the tax rate
}

export interface Reminder {
  kind: "annual_maximum_expires" | "fsa_forfeited" | "cleaning_covered";
  deadline: string; // ISO date
  amount: number;
  message: string;
}

// One dentist, priced on their own lowest-cost option within the tolerance.
export interface DentistOption {
  provider_id: string;
  name: string;
  distance_miles: number;
  credentials: string[];
  in_network: boolean;
  lowest_cost: CarePlanOption;
  baseline: CarePlanOption; // this dentist, earliest date, insured
  savings: Savings; // baseline minus lowest_cost
}

// What POST /api/care-plan/compare returns. Each column is sorted by the
// expected cost of each dentist's lowest-cost option, nearest first on ties.
export interface CareComparison {
  as_of: string; // ISO date
  procedure: string; // CDT code
  tolerance: string;
  tail_weight: number;
  risk_bands: RiskBand[];
  in_network: DentistOption[];
  out_of_network: DentistOption[];
  risk: RiskSummary;
  assumptions: string[];
}

export interface CarePlan {
  as_of: string; // ISO date
  provider_id: string;
  tolerance: string; // highest risk band accepted
  tail_weight: number;
  risk_bands: RiskBand[]; // the tolerances a request can choose from
  options: CarePlanOption[]; // date order
  // Lowest expected cost plus tail_weight times the costliest 5% of
  // futures, within the tolerance
  lowest_cost: CarePlanOption;
  baseline: CarePlanOption; // earliest date, insured
  savings: Savings; // baseline minus lowest_cost
  lever_savings: Record<string, number>; // timing, cash, fsa_planning
  beyond_tolerance: CarePlanOption | null; // cheaper but riskier
  beyond_tolerance_savings: Savings | null; // versus lowest_cost
  maximum: MaximumUsage[];
  fsa: FsaTracker | null;
  reminders: Reminder[];
  risk: RiskSummary;
  assumptions: string[];
}
