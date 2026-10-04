// Backend calls. Request and response shapes match the Pydantic models in
// backend/onboarding.py, backend/provider.py, backend/simulation_api.py and
// backend/care_plan_api.py, so what you see in /docs is what these describe.

import type {
  CareComparison,
  CarePlan,
  OnboardingResult,
  Procedure,
  ProvidersResult,
  QuizAnswers,
  QuizQuestion,
  SamplePlan,
  ToothSimulation,
} from "./types";

export interface FormOptions {
  plans: SamplePlan[];
  procedures: Procedure[];
}

export interface CoverageInput {
  annual_maximum: number;
  deductible: number;
  preventive: number;
  basic: number;
  major: number;
  plan_year_start: string;
}
export interface MemberInput {
  as_of: string;
  coverage_start: string;
  amount_used: number;
  deductible_met: number;
}
export interface CoverageExtraction {
  document_type: string;
  fields: Record<
    string,
    { value: string | number; page: number; evidence: string }
  >;
  warnings: string[];
  requires_confirmation: boolean;
}
export function extract_coverage(file: File): Promise<CoverageExtraction> {
  const body = new FormData();
  body.append("file", file);
  return request("/api/coverage/extract", { method: "POST", body });
}
export interface OnboardingRequest {
  coverage?: CoverageInput;
  member?: MemberInput;
  plan_id: string;
  subscriber_id?: string;
  procedure_code: string;
  quiz_answers: QuizAnswers;
}

export interface ProvidersRequest extends OnboardingRequest {
  radius_miles?: number; // default 25
  date_of_service?: string; // ISO date, default the member's as_of
}

export interface PlanningRequest extends OnboardingRequest {
  risk_tolerance?: string; // a risk band name, default the lowest band
  tail_weight?: number; // default from the backend (0.1)
}

export interface CompareRequest extends PlanningRequest {
  radius_miles?: number; // default 25
}

export interface CarePlanRequest extends PlanningRequest {
  provider_id: string;
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

// How the untreated tooth may progress. Same futures as the care plan
// endpoints, so its risk bands match theirs.
export function fetch_simulation(
  body: OnboardingRequest,
): Promise<ToothSimulation> {
  return request<ToothSimulation>("/api/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Every nearby dentist, each on their own lowest-cost schedule. Run this
// before fetch_care_plan: a dentist's card matches their plan.
export function fetch_care_comparison(
  body: CompareRequest,
): Promise<CareComparison> {
  return request<CareComparison>("/api/care-plan/compare", {
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
