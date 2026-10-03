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
  out_of_network_allowed: Record<string, number>; // CDT code, allowed amount
  subscriber_id_pattern: string;
  subscriber_id_example: string;
}

export interface MemberStatus {
  subscriber_id: string;
  coverage_start: string; // ISO date, waiting periods count from here
  amount_used: number; // this plan year
  deductible_met: number; // this plan year
}

export interface Procedure {
  cdt_code: string;
  name: string;
  description: string;
  category: InsuranceType;
  typical_fee: number;
  treats_state: ToothState;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  applies_to?: ToothState[]; // omitted means question applies to every procedure
}

export type QuizAnswers = Record<string, string>; // question id, option id

export interface OnboardingResult {
  plan: Plan;
  member: MemberStatus;
  procedure: Procedure;
  quiz_answers: QuizAnswers;
}

export interface OnboardingRequest {
  planId: string;
  subscriberId: string;
  procedureCode: string;
  quizAnswers: Record<string, string>; // question id, option id
}
