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

export interface MemberStatus {
  subscriber_id: string;
  as_of: string; // ISO date the balances describe; the backend's "today"
  coverage_start: string; // ISO date, waiting periods count from here
  amount_used: number; // this plan year
  deductible_met: number; // this plan year
  past_services: PastService[]; // oldest first; frequency limits count these
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

// What POST /api/providers returns; each column sorted by you_pay.
export interface ProvidersResult {
  procedure: string;
  date_of_service: string; // ISO date
  in_network: ProviderCard[];
  out_of_network: ProviderCard[];
}
