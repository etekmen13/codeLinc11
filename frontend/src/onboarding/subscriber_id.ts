import type { Plan } from "../types";

// Fake IDs for the demo, in the plan's format.
export function generate_subscriber_id(plan: Plan): string {
  return plan.subscriber_id_example.replace(/\d/g, () =>
    String(Math.floor(Math.random() * 10)),
  );
}

export function normalize_subscriber_id(id: string): string {
  return id.trim().toUpperCase();
}

// Instant feedback only; the backend checks again on submit.
export function is_valid_subscriber_id(plan: Plan, id: string): boolean {
  return new RegExp(`^(?:${plan.subscriber_id_pattern})$`).test(
    normalize_subscriber_id(id),
  );
}
