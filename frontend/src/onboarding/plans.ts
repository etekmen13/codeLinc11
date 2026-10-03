import type { MemberStatus, Plan } from "../types";

// toy insurance plans
//
export interface SamplePlan {
  plan: Plan;
  default_member: Omit<MemberStatus, "subscriber_id">;
}

export const sample_plans: SamplePlan[] = [
  {
    // Generous plan, some usage already.
    plan: {
      id: "summit-ppo-plus",
      insurer: "Summit Dental",
      plan_name: "PPO Plus",
      annual_maximum: 2000,
      deductible: 50,
      deductible_applies_to: ["basic", "major"],
      coinsurance: { preventive: 1.0, basic: 0.8, major: 0.5 },
      waiting_period_months: { preventive: 0, basic: 0, major: 0 },
      frequency_limits: [
        { cdt_code: "D1110", count: 2, per_months: 12 },
        { cdt_code: "D2740", count: 1, per_months: 60 },
      ],
      plan_year_start: "2026-01-01",
      out_of_network_allowed: {
        D1110: 95,
        D1206: 30,
        D2391: 160,
        D3330: 950,
        D2740: 1000,
        D7140: 175,
      },
      subscriber_id_pattern: "^SMT-\\d{7}$",
      subscriber_id_example: "SMT-4821937",
    },
    default_member: {
      coverage_start: "2025-01-01",
      amount_used: 350,
      deductible_met: 50,
    },
  },
  {
    // Lower maximum and waiting periods
    // the employee enrolled mid-year, so major work is not covered until July 2027.
    plan: {
      id: "harbor-ppo-basic",
      insurer: "Harbor Benefits",
      plan_name: "PPO Basic",
      annual_maximum: 1000,
      deductible: 75,
      deductible_applies_to: ["basic", "major"],
      coinsurance: { preventive: 1.0, basic: 0.7, major: 0.5 },
      waiting_period_months: { preventive: 0, basic: 6, major: 12 },
      frequency_limits: [
        { cdt_code: "D1110", count: 2, per_months: 12 },
        { cdt_code: "D2740", count: 1, per_months: 84 },
      ],
      plan_year_start: "2026-01-01",
      out_of_network_allowed: {
        D1110: 85,
        D1206: 25,
        D2391: 140,
        D3330: 850,
        D2740: 900,
        D7140: 160,
      },
      subscriber_id_pattern: "^HB\\d{9}$",
      subscriber_id_example: "HB302118774",
    },
    default_member: {
      coverage_start: "2026-07-01",
      amount_used: 0,
      deductible_met: 0,
    },
  },
  {
    // Most of the maximum already used.
    // splitting treatment across the plan-year reset saves the most.
    plan: {
      id: "keystone-ppo",
      insurer: "Keystone Mutual",
      plan_name: "Dental PPO",
      annual_maximum: 1500,
      deductible: 100,
      deductible_applies_to: ["preventive", "basic", "major"],
      coinsurance: { preventive: 1.0, basic: 0.8, major: 0.5 },
      waiting_period_months: { preventive: 0, basic: 0, major: 0 },
      frequency_limits: [
        { cdt_code: "D1110", count: 2, per_months: 12 },
        { cdt_code: "D2740", count: 1, per_months: 60 },
      ],
      plan_year_start: "2026-01-01",
      out_of_network_allowed: {
        D1110: 100,
        D1206: 35,
        D2391: 170,
        D3330: 1000,
        D2740: 1050,
        D7140: 180,
      },
      subscriber_id_pattern: "^K\\d{3}-\\d{4}-\\d{2}$",
      subscriber_id_example: "K417-2290-08",
    },
    default_member: {
      coverage_start: "2024-01-01",
      amount_used: 1100,
      deductible_met: 100,
    },
  },
];

export function find_sample_plan(plan_id: string): SamplePlan | undefined {
  return sample_plans.find((s) => s.plan.id === plan_id);
}

// Fake IDs
export function generate_subscriber_id(plan: Plan): string {
  return plan.subscriber_id_example.replace(/\d/g, () =>
    String(Math.floor(Math.random() * 10)),
  );
}

export function normalize_subscriber_id(id: string): string {
  return id.trim().toUpperCase();
}

export function is_valid_subscriber_id(plan: Plan, id: string): boolean {
  return new RegExp(plan.subscriber_id_pattern).test(
    normalize_subscriber_id(id),
  );
}
