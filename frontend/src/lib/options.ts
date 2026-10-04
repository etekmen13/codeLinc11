import type { CarePlanOption, CarePlanVisit } from "../types";

// Average of a visit amount over the tooth states an option's futures reach.
function expected(
  option: CarePlanOption,
  amount: (visit: CarePlanVisit) => number,
): number {
  return option.outcomes.reduce(
    (total, x) => total + x.probability * amount(x.visit),
    0,
  );
}

export function expected_plan_pays(option: CarePlanOption): number {
  return expected(option, (v) => v.plan_pays);
}

export function expected_balance_bill(option: CarePlanOption): number {
  return expected(option, (v) =>
    v.lines.reduce((total, line) => total + line.balance_billing, 0),
  );
}

// From this year's balance and from next year's election, on average.
export function fsa_used(option: CarePlanOption): number {
  return option.fsa.from_balance + option.fsa.from_election;
}
