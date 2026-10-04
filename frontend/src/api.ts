// Backend calls. Request and response shapes match the Pydantic models in
// backend/onboarding.py, backend/provider.py, and backend/care_plan_api.py,
// so what you see in /docs is what these describe.

import type {
  CarePlan,
  OnboardingResult,
  Procedure,
  ProvidersResult,
  QuizAnswers,
  QuizQuestion,
  SamplePlan,
} from "./types";

export interface FormOptions {
  plans: SamplePlan[];
  procedures: Procedure[];
}

export interface OnboardingRequest {
  plan_id: string;
  subscriber_id: string;
  procedure_code: string;
  quiz_answers: QuizAnswers;
}

export interface ProvidersRequest extends OnboardingRequest {
  radius_miles?: number; // default 25
  date_of_service?: string; // ISO date, default the member's as_of
}

export interface CarePlanRequest extends OnboardingRequest {
  provider_id: string;
  risk_tolerance?: string; // a risk band name, default the lowest band
  tail_weight?: number; // default from the backend (0.1)
}

// FastAPI sends {"detail": "..."} or {"detail": ["...", ...]} from
// HTTPException, and {"detail": [{loc, msg}, ...]} when the request body
// fails validation. Flatten all three into a list of readable messages.
export class ApiError extends Error {
  readonly status: number;
  readonly problems: string[];

  constructor(status: number, problems: string[]) {
    super(problems.join("; "));
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}

async function read_problems(res: Response): Promise<string[]> {
  try {
    const { detail } = (await res.json()) as { detail?: unknown };
    if (typeof detail === "string") return [detail];
    if (Array.isArray(detail)) {
      return detail.map((item: unknown) => {
        if (typeof item === "string") return item;
        const { loc, msg } = item as { loc?: unknown[]; msg?: string };
        return loc ? `${loc.join(".")}: ${msg}` : String(msg);
      });
    }
  } catch {
    // Body was not JSON; fall through to the status line.
  }
  return [`${res.status} ${res.statusText}`];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiError(res.status, await read_problems(res));
  return (await res.json()) as T;
}

export function problems_of(err: unknown): string[] {
  if (err instanceof ApiError) return err.problems;
  return [err instanceof Error ? err.message : String(err)];
}

export function fetch_form(): Promise<FormOptions> {
  return request<FormOptions>("/api/onboarding/form");
}

export function fetch_quiz(procedure_code: string): Promise<QuizQuestion[]> {
  const query = new URLSearchParams({ procedure: procedure_code });
  return request<QuizQuestion[]>(`/api/quiz?${query}`);
}

export function submit_onboarding(
  body: OnboardingRequest,
): Promise<OnboardingResult> {
  return request<OnboardingResult>("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetch_providers(
  body: ProvidersRequest,
): Promise<ProvidersResult> {
  return request<ProvidersResult>("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetch_care_plan(body: CarePlanRequest): Promise<CarePlan> {
  return request<CarePlan>("/api/care-plan/sequence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
