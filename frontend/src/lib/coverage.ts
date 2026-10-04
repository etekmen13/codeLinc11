import type { InsuranceType, MemberStatus, Plan } from "../types";

// Parse "YYYY-MM-DD" as a local date. new Date("2026-01-01") is UTC midnight,
// which displays as Dec 31 in US time zones.
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function remainingMaximum(
  plan: Plan,
  member: Pick<MemberStatus, "amount_used">,
): number {
  return Math.max(0, plan.annual_maximum - member.amount_used);
}

export function remainingDeductible(
  plan: Plan,
  member: Pick<MemberStatus, "deductible_met">,
): number {
  return Math.max(0, plan.deductible - member.deductible_met);
}

export function planYearResetDate(plan: Plan): Date {
  return addMonths(parseISODate(plan.plan_year_start), 12);
}

export function waitingPeriodEnds(
  plan: Plan,
  member: Pick<MemberStatus, "coverage_start">,
  category: InsuranceType,
): Date {
  return addMonths(
    parseISODate(member.coverage_start),
    plan.waiting_period_months[category],
  );
}

// Checked on the member's as_of date, the backend's single "today".
export function isInWaitingPeriod(
  plan: Plan,
  member: Pick<MemberStatus, "coverage_start" | "as_of">,
  category: InsuranceType,
): boolean {
  return parseISODate(member.as_of) < waitingPeriodEnds(plan, member, category);
}
