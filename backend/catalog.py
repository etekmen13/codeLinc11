"""Sample plans and the procedure catalog. The canonical copy of this data:
the frontend gets what it displays from GET /api/onboarding/form.

Insurers are fictional. Numbers are typical of US employer PPO plans but not
taken from any real policy. Fees are rough US averages.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from progression import STATE_INDEX

Category = Literal["preventive", "basic", "major"]


@dataclass(frozen=True)
class FrequencyLimit:
    cdt_code: str
    count: int
    per_months: int


@dataclass(frozen=True)
class Plan:
    """Policy terms, shared by every employee on the plan."""

    id: str
    insurer: str
    plan_name: str
    annual_maximum: float
    deductible: float
    deductible_applies_to: frozenset[Category]
    coinsurance: dict[Category, float]  # fraction the plan pays
    waiting_period_months: dict[Category, int]
    frequency_limits: tuple[FrequencyLimit, ...]
    plan_year_start: str  # ISO date; resets one year later
    out_of_network_allowed: dict[str, float]  # procedure code -> allowed amount
    subscriber_id_pattern: str
    subscriber_id_example: str


@dataclass(frozen=True)
class PastService:
    cdt_code: str
    date_of_service: str  # ISO date


@dataclass(frozen=True)
class MemberStatus:
    """Per-employee state. In v0 each sample plan ships with a default member;
    a real system would look this up by subscriber ID."""

    coverage_start: str  # ISO date; waiting periods count from here
    amount_used: float  # this plan year
    deductible_met: float  # this plan year
    # Claims history, oldest first; frequency limits count these. Tracked
    # apart from amount_used, which also covers exams, X-rays, and other
    # services outside this catalog.
    past_services: tuple[PastService, ...] = ()


@dataclass(frozen=True)
class Procedure:
    cdt_code: str
    name: str
    description: str
    category: Category
    typical_fee: float
    # The condition this procedure treats: where the simulation starts.
    treats_state: str


@dataclass(frozen=True)
class SamplePlan:
    plan: Plan
    default_member: MemberStatus


SAMPLE_PLANS: tuple[SamplePlan, ...] = (
    SamplePlan(
        # Generous plan with some usage already.
        Plan(
            id="summit-ppo-plus",
            insurer="Summit Dental",
            plan_name="PPO Plus",
            annual_maximum=2000,
            deductible=50,
            deductible_applies_to=frozenset({"basic", "major"}),
            coinsurance={"preventive": 1.0, "basic": 0.8, "major": 0.5},
            waiting_period_months={"preventive": 0, "basic": 0, "major": 0},
            frequency_limits=(
                FrequencyLimit("D1110", 2, 12),
                FrequencyLimit("D2740", 1, 60),
            ),
            plan_year_start="2026-01-01",
            out_of_network_allowed={
                "D1110": 95,
                "D1206": 30,
                "D2391": 160,
                "D3330": 950,
                "D2740": 1000,
                "D7140": 175,
            },
            subscriber_id_pattern=r"SMT-\d{7}",
            subscriber_id_example="SMT-4821937",
        ),
        MemberStatus(
            coverage_start="2025-01-01",
            amount_used=350,
            deductible_met=50,
            # Two cleanings in the last 12 months: the next is covered from
            # 2026-10-15.
            past_services=(
                PastService("D1110", "2025-10-15"),
                PastService("D1110", "2026-04-14"),
            ),
        ),
    ),
    SamplePlan(
        # Waiting periods; the member enrolled mid-year, so major work is not
        # covered until July 2027.
        Plan(
            id="harbor-ppo-basic",
            insurer="Harbor Benefits",
            plan_name="PPO Basic",
            annual_maximum=1000,
            deductible=75,
            deductible_applies_to=frozenset({"basic", "major"}),
            coinsurance={"preventive": 1.0, "basic": 0.7, "major": 0.5},
            waiting_period_months={"preventive": 0, "basic": 6, "major": 12},
            frequency_limits=(
                FrequencyLimit("D1110", 2, 12),
                FrequencyLimit("D2740", 1, 84),
            ),
            plan_year_start="2026-01-01",
            out_of_network_allowed={
                "D1110": 85,
                "D1206": 25,
                "D2391": 140,
                "D3330": 850,
                "D2740": 900,
                "D7140": 160,
            },
            subscriber_id_pattern=r"HB\d{9}",
            subscriber_id_example="HB302118774",
        ),
        MemberStatus(coverage_start="2026-07-01", amount_used=0, deductible_met=0),
    ),
    SamplePlan(
        # Most of the maximum already used: splitting treatment across the
        # plan-year reset saves the most here.
        Plan(
            id="keystone-ppo",
            insurer="Keystone Mutual",
            plan_name="Dental PPO",
            annual_maximum=1500,
            deductible=100,
            deductible_applies_to=frozenset({"preventive", "basic", "major"}),
            coinsurance={"preventive": 1.0, "basic": 0.8, "major": 0.5},
            waiting_period_months={"preventive": 0, "basic": 0, "major": 0},
            frequency_limits=(
                FrequencyLimit("D1110", 2, 12),
                FrequencyLimit("D2740", 1, 60),
            ),
            plan_year_start="2026-01-01",
            out_of_network_allowed={
                "D1110": 100,
                "D1206": 35,
                "D2391": 170,
                "D3330": 1000,
                "D2740": 1050,
                "D7140": 180,
            },
            subscriber_id_pattern=r"K\d{3}-\d{4}-\d{2}",
            subscriber_id_example="K417-2290-08",
        ),
        MemberStatus(
            coverage_start="2024-01-01",
            amount_used=1100,
            deductible_met=100,
            # A root canal on another tooth used most of this year's maximum.
            # No crown: limits are not per tooth yet, so a past crown would
            # count against every tooth.
            past_services=(
                PastService("D1110", "2025-08-20"),
                PastService("D1110", "2026-02-18"),
                PastService("D3330", "2026-03-04"),
                PastService("D2391", "2026-05-06"),
            ),
        ),
    ),
)

PROCEDURES: tuple[Procedure, ...] = (
    Procedure(
        "D1110",
        "Cleaning",
        "Routine cleaning to remove plaque and tartar.",
        "preventive",
        120,
        "healthy",
    ),
    Procedure(
        "D1206",
        "Fluoride varnish",
        "Fluoride coating that can reverse a very early cavity.",
        "preventive",
        40,
        "early_lesion",
    ),
    Procedure(
        "D2391",
        "Filling (back tooth, one surface)",
        "Removes decay and fills the tooth with tooth-colored resin.",
        "basic",
        200,
        "cavity",
    ),
    Procedure(
        "D3330",
        "Root canal (molar)",
        "Removes infected nerve tissue from inside the tooth.",
        "major",
        1200,
        "root_canal",
    ),
    Procedure(
        # Usually follows a root canal on a back tooth.
        "D2740",
        "Crown",
        "A cap that covers and protects a weakened tooth.",
        "major",
        1300,
        "root_canal",
    ),
    Procedure(
        "D7140",
        "Simple extraction",
        "Removes a tooth that cannot be saved.",
        "basic",
        220,
        "extraction",
    ),
)

PLANS_BY_ID: dict[str, SamplePlan] = {s.plan.id: s for s in SAMPLE_PLANS}
PROCEDURES_BY_CODE: dict[str, Procedure] = {p.cdt_code: p for p in PROCEDURES}


def normalize_subscriber_id(raw: str) -> str:
    return raw.strip().upper()


def is_valid_subscriber_id(plan: Plan, subscriber_id: str) -> bool:
    return re.fullmatch(plan.subscriber_id_pattern, subscriber_id) is not None


def _check() -> None:
    if len(PLANS_BY_ID) != len(SAMPLE_PLANS):
        raise ValueError("duplicate plan id")
    if len(PROCEDURES_BY_CODE) != len(PROCEDURES):
        raise ValueError("duplicate procedure code")
    for p in PROCEDURES:
        if p.treats_state not in STATE_INDEX:
            raise ValueError(f"procedure {p.cdt_code} treats unknown state")
    for s in SAMPLE_PLANS:
        if not is_valid_subscriber_id(s.plan, s.plan.subscriber_id_example):
            raise ValueError(f"plan {s.plan.id}: example ID fails its pattern")
        history = s.default_member.past_services
        if any(h.cdt_code not in PROCEDURES_BY_CODE for h in history):
            raise ValueError(f"plan {s.plan.id}: past service has unknown procedure")
        dates = [date.fromisoformat(h.date_of_service) for h in history]
        if dates != sorted(dates):
            raise ValueError(f"plan {s.plan.id}: past services must be oldest first")


_check()
