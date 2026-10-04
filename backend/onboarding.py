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

from dataclasses import dataclass
from datetime import date

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import quiz
from catalog import (
    PLANS_BY_ID,
    PROCEDURES,
    PROCEDURES_BY_CODE,
    SAMPLE_PLANS,
    MemberStatus,
    PastService,
    Plan,
    Procedure,
    SamplePlan,
    is_valid_subscriber_id,
    normalize_subscriber_id,
)
from progression import EDGES, edge_name


class OnboardingRequest(BaseModel):
    plan_id: str
    subscriber_id: str
    procedure_code: str
    quiz_answers: dict[str, str]  # question id -> option id


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
            f"subscriber ID {subscriber_id!r} does not match {sample.plan.insurer}'s "
            f"format, e.g. {sample.plan.subscriber_id_example}"
        )

    procedure = PROCEDURES_BY_CODE.get(req.procedure_code)
    if procedure is None:
        problems.append(f"unknown procedure {req.procedure_code!r}")
    else:
        problems += quiz.validate_answers(procedure.treats_state, req.quiz_answers)

    if problems or sample is None or procedure is None:
        raise InvalidOnboarding(problems)

    return Onboarded(
        plan=sample.plan,
        member=sample.default_member,
        subscriber_id=subscriber_id,
        procedure=procedure,
        quiz_answers=dict(req.quiz_answers),
        as_of=date.fromisoformat(sample.default_member.as_of),
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
