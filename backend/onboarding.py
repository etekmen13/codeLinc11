"""Onboarding endpoints.

Flow:
  GET  /api/onboarding/form          plans and procedures for the form
  GET  /api/quiz?procedure=CODE      questions for that procedure
  POST /api/onboarding               validate the form, return OnboardingResult

The backend keeps no session. Later endpoints (simulation, providers, care
plan) should accept the same OnboardingRequest body and call
validate_onboarding, so every request is self-contained and can be replayed
from /docs.
"""

from dataclasses import dataclass, replace
from datetime import date

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

import quiz
from catalog import (
    PLANS_BY_ID,
    PROCEDURES,
    PROCEDURES_BY_CODE,
    SAMPLE_PLANS,
    Fsa,
    MemberStatus,
    PastService,
    Plan,
    Procedure,
    SamplePlan,
    is_valid_subscriber_id,
    normalize_subscriber_id,
)
from progression import EDGES, edge_name


class CoverageInput(BaseModel):
    annual_maximum: float = Field(ge=0, le=100000)
    deductible: float = Field(ge=0, le=10000)
    preventive: float = Field(ge=0, le=1)
    basic: float = Field(ge=0, le=1)
    major: float = Field(ge=0, le=1)
    plan_year_start: date


class MemberInput(BaseModel):
    as_of: date
    coverage_start: date
    amount_used: float = Field(ge=0, le=100000)
    deductible_met: float = Field(ge=0, le=10000)

    @model_validator(mode="after")
    def check_dates(self):
        if self.coverage_start > self.as_of:
            raise ValueError("Coverage start must be on or before the balance date")
        return self


class OnboardingRequest(BaseModel):
    plan_id: str
    subscriber_id: str
    procedure_code: str
    quiz_answers: dict[str, str]  # question id -> option id
    coverage: CoverageInput | None = None
    member: MemberInput | None = None


@dataclass(frozen=True)
class Onboarded:
    """A validated request, resolved against the catalog."""

    plan: Plan
    member: MemberStatus
    subscriber_id: str
    procedure: Procedure
    quiz_answers: dict[str, str]
    # The single "today" for everything downstream. From the sample member
    # now; real form input would set it here.
    as_of: date


class InvalidOnboarding(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def validate_onboarding(req: OnboardingRequest) -> Onboarded:
    """Raise InvalidOnboarding listing every problem, so one round trip
    shows everything to fix."""
    problems: list[str] = []

    sample = PLANS_BY_ID.get(req.plan_id)
    if sample is None:
        problems.append(f"unknown plan {req.plan_id!r}")

    subscriber_id = normalize_subscriber_id(req.subscriber_id)
    if sample and not is_valid_subscriber_id(sample.plan, subscriber_id):
        problems.append(
            f"subscriber ID {subscriber_id!r} does not match the demo plan's "
            f"format, e.g. {sample.plan.subscriber_id_example}"
        )

    procedure = PROCEDURES_BY_CODE.get(req.procedure_code)
    if procedure is None:
        problems.append(f"unknown procedure {req.procedure_code!r}")
    else:
        problems += quiz.validate_answers(procedure.treats_state, req.quiz_answers)

    if problems or sample is None or procedure is None:
        raise InvalidOnboarding(problems)

    plan = sample.plan
    member = sample.default_member
    if req.coverage:
        c = req.coverage
        plan = replace(
            plan,
            annual_maximum=c.annual_maximum,
            deductible=c.deductible,
            coinsurance={
                "preventive": c.preventive,
                "basic": c.basic,
                "major": c.major,
            },
            plan_year_start=c.plan_year_start.isoformat(),
        )
    if req.member:
        m = req.member
        member = replace(
            member,
            as_of=m.as_of.isoformat(),
            coverage_start=m.coverage_start.isoformat(),
            amount_used=m.amount_used,
            deductible_met=m.deductible_met,
        )
    if (
        member.amount_used > plan.annual_maximum
        or member.deductible_met > plan.deductible
    ):
        raise InvalidOnboarding(
            ["Used benefits and deductible met cannot exceed the plan limits"]
        )
    begin = date.fromisoformat(plan.plan_year_start)
    as_of = date.fromisoformat(member.as_of)
    from cost import add_months

    if not begin <= as_of < add_months(begin, 12):
        raise InvalidOnboarding(
            ["Balance date must fall within the selected benefit year"]
        )
    if any(
        date.fromisoformat(service.date_of_service) > as_of
        for service in member.past_services
    ):
        raise InvalidOnboarding(["Balance date precedes the demo claims history"])

    return Onboarded(
        plan=plan,
        member=member,
        subscriber_id=subscriber_id,
        procedure=procedure,
        quiz_answers=dict(req.quiz_answers),
        as_of=as_of,
    )


# Response models. Field names match frontend/src/types.ts.


class FormOut(BaseModel):
    plans: list[SamplePlan]
    procedures: list[Procedure]


class OptionOut(BaseModel):
    id: str
    label: str


class QuestionOut(BaseModel):
    id: str
    prompt: str
    options: list[OptionOut]


class MemberOut(BaseModel):
    subscriber_id: str
    as_of: str
    coverage_start: str
    amount_used: float
    deductible_met: float
    past_services: list[PastService]
    fsa: Fsa | None


class OnboardingOut(BaseModel):
    plan: Plan
    member: MemberOut
    procedure: Procedure
    quiz_answers: dict[str, str]
    start_state: str
    hazard_multipliers: dict[str, float]  # "a->b" -> multiplier on that edge


router = APIRouter(prefix="/api", tags=["onboarding"])


@router.get("/onboarding/form")
def get_form() -> FormOut:
    return FormOut(plans=list(SAMPLE_PLANS), procedures=list(PROCEDURES))


@router.get("/quiz")
def get_quiz(procedure: str) -> list[QuestionOut]:
    proc = PROCEDURES_BY_CODE.get(procedure)
    if proc is None:
        raise HTTPException(422, f"unknown procedure {procedure!r}")
    return [
        QuestionOut(
            id=q.id,
            prompt=q.prompt,
            options=[OptionOut(id=o.id, label=o.label) for o in q.options],
        )
        for q in quiz.questions_for(proc.treats_state)
    ]


@router.post("/onboarding")
def post_onboarding(req: OnboardingRequest) -> OnboardingOut:
    try:
        o = validate_onboarding(req)
    except InvalidOnboarding as e:
        raise HTTPException(422, e.problems) from e

    log_m = quiz.log_multipliers(o.quiz_answers)
    return OnboardingOut(
        plan=o.plan,
        member=MemberOut(subscriber_id=o.subscriber_id, **vars(o.member)),
        procedure=o.procedure,
        quiz_answers=o.quiz_answers,
        start_state=o.procedure.treats_state,
        hazard_multipliers={
            edge_name(e): round(float(np.exp(m)), 4)
            for e, m in zip(EDGES, log_m, strict=True)
        },
    )
