"""Sample plans, the procedure catalog, and providers. The canonical copy of
this data: the frontend gets what it displays from GET /api/onboarding/form.

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
    in_network_fees: dict[str, float]  # procedure code -> negotiated fee
    out_of_network_allowed: dict[str, float]  # procedure code -> allowed amount
    subscriber_id_pattern: str
    subscriber_id_example: str


@dataclass(frozen=True)
class PastService:
    cdt_code: str
    date_of_service: str  # ISO date


@dataclass(frozen=True)
class Fsa:
    """A health flexible spending account: pre-tax money for the member's
    share of dental costs. It is an employer benefit separate from the dental
    plan, so it never changes what the plan pays. Next FSA year is assumed to
    have the same rules. Toy values."""

    balance: float  # unspent this FSA year, as of the member's as_of
    year_end: str  # ISO date; last day of this FSA year
    # Expenses up to this ISO date can still use this year's balance. A plan
    # offers a grace period or a carryover, not both.
    grace_period_end: str | None
    carryover_limit: float  # unspent dollars kept for next year; 0 = none
    election_limit: float  # most the member can elect for a year
    # Combined federal, state, and payroll rate: what a pre-tax dollar saves.
    marginal_tax_rate: float


@dataclass(frozen=True)
class MemberStatus:
    """Per-employee state. In v0 each sample plan ships with a default member;
    a real system would look this up by subscriber ID."""

    # ISO date the balances below describe. The single "today" for the
    # backend: simulations start here and pricing defaults to it.
    as_of: str
    coverage_start: str  # ISO date; waiting periods count from here
    amount_used: float  # this plan year
    deductible_met: float  # this plan year
    # Claims history, oldest first; frequency limits count these. Tracked
    # apart from amount_used, which also covers exams, X-rays, and other
    # services outside this catalog.
    past_services: tuple[PastService, ...] = ()
    fsa: Fsa | None = None  # None if the employer offers no FSA


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


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    lat: float
    lon: float
    credentials: tuple[str, ...]
    networks: frozenset[str]  # ids of the plans this dentist is in network with
    fees: dict[str, float]  # procedure code -> billed fee; missing = not offered
    cash_prices: dict[str, float]  # procedure code -> self-pay price; missing = none


# The date every sample member's balances describe.
SAMPLE_AS_OF = "2026-10-01"

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
            in_network_fees={
                "D1110": 85,
                "D1206": 28,
                "D2391": 150,
                "D3330": 900,
                "D2740": 950,
                "D7140": 165,
                "D6010": 1650,
                "D6065": 1150,
            },
            out_of_network_allowed={
                "D1110": 95,
                "D1206": 30,
                "D2391": 160,
                "D3330": 950,
                "D2740": 1000,
                "D7140": 175,
                "D6010": 1750,
                "D6065": 1200,
            },
            subscriber_id_pattern=r"SMT-\d{7}",
            subscriber_id_example="SMT-4821937",
        ),
        MemberStatus(
            as_of=SAMPLE_AS_OF,
            coverage_start="2025-01-01",
            amount_used=350,
            deductible_met=50,
            # Two cleanings in the last 12 months: the next is covered from
            # 2026-10-15.
            past_services=(
                PastService("D1110", "2025-10-15"),
                PastService("D1110", "2026-04-14"),
            ),
            # A grace period: care until mid-March can use this year's
            # balance and next plan year's fresh maximum.
            fsa=Fsa(
                balance=300,
                year_end="2026-12-31",
                grace_period_end="2027-03-15",
                carryover_limit=0,
                election_limit=3400,
                marginal_tax_rate=0.30,
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
            in_network_fees={
                "D1110": 80,
                "D1206": 24,
                "D2391": 135,
                "D3330": 820,
                "D2740": 870,
                "D7140": 150,
                "D6010": 1550,
                "D6065": 1100,
            },
            out_of_network_allowed={
                "D1110": 85,
                "D1206": 25,
                "D2391": 140,
                "D3330": 850,
                "D2740": 900,
                "D7140": 160,
                "D6010": 1650,
                "D6065": 1150,
            },
            subscriber_id_pattern=r"HB\d{9}",
            subscriber_id_example="HB302118774",
        ),
        MemberStatus(
            as_of=SAMPLE_AS_OF,
            coverage_start="2026-07-01",
            amount_used=0,
            deductible_met=0,
            # A carryover: up to $680 of unspent money moves to next year.
            fsa=Fsa(
                balance=250,
                year_end="2026-12-31",
                grace_period_end=None,
                carryover_limit=680,
                election_limit=3400,
                marginal_tax_rate=0.22,
            ),
        ),
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
            in_network_fees={
                "D1110": 90,
                "D1206": 30,
                "D2391": 155,
                "D3330": 940,
                "D2740": 990,
                "D7140": 170,
                "D6010": 1700,
                "D6065": 1200,
            },
            out_of_network_allowed={
                "D1110": 100,
                "D1206": 35,
                "D2391": 170,
                "D3330": 1000,
                "D2740": 1050,
                "D7140": 180,
                "D6010": 1800,
                "D6065": 1250,
            },
            subscriber_id_pattern=r"K\d{3}-\d{4}-\d{2}",
            subscriber_id_example="K417-2290-08",
        ),
        MemberStatus(
            as_of=SAMPLE_AS_OF,
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
            # Use it or lose it: the balance pulls spending into this year
            # while the nearly used maximum pushes it into the next.
            fsa=Fsa(
                balance=400,
                year_end="2026-12-31",
                grace_period_end=None,
                carryover_limit=0,
                election_limit=3400,
                marginal_tax_rate=0.30,
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
    Procedure(
        # Replaces an extracted tooth. Without it, losing the tooth would
        # look cheaper than saving it.
        "D6010",
        "Implant post",
        "Surgically places a titanium post that replaces the tooth's root.",
        "major",
        2200,
        "extraction",
    ),
    Procedure(
        # Placed on the implant post once it has healed, 3 to 6 months later.
        "D6065",
        "Implant crown",
        "A porcelain crown attached to the implant post.",
        "major",
        1500,
        "extraction",
    ),
)

# What it takes to treat a tooth found in each state, in billing order (the
# first line absorbs the deductible). Prices a tooth that got worse than the
# procedure the member picked. v0 bills a whole bundle on one date; v1 may
# split multi-visit work (root canal then crown) into dated steps.
TREATMENT_FOR_STATE: dict[str, tuple[str, ...]] = {
    "healthy": (),
    "early_lesion": ("D1206",),
    "cavity": ("D2391",),
    "root_canal": ("D3330", "D2740"),
    "extraction": ("D7140", "D6010", "D6065"),
}

ALL_PLANS = frozenset({"summit-ppo-plus", "harbor-ppo-basic", "keystone-ppo"})

# Charlotte, NC. Billed fees sit around each procedure's typical fee; a cash
# price is a self-pay discount, which some offices do not offer.
PROVIDERS: tuple[Provider, ...] = (
    Provider(
        id="uptown-smiles",
        name="Uptown Smiles",
        lat=35.2270,
        lon=-80.8430,
        credentials=("DDS",),
        networks=ALL_PLANS,
        fees={
            "D1110": 115,
            "D1206": 35,
            "D2391": 190,
            "D3330": 1150,
            "D2740": 1250,
            "D7140": 210,
            "D6010": 2300,
            "D6065": 1550,
        },
        cash_prices={
            "D1110": 100,
            "D1206": 30,
            "D2391": 160,
            "D3330": 1000,
            "D2740": 1100,
            "D7140": 180,
            "D6010": 2000,
            "D6065": 1350,
        },
    ),
    Provider(
        id="southpark-dental",
        name="SouthPark Dental",
        lat=35.1500,
        lon=-80.8300,
        credentials=("DMD",),
        networks=ALL_PLANS,
        fees={
            "D1110": 130,
            "D1206": 45,
            "D2391": 220,
            "D3330": 1300,
            "D2740": 1400,
            "D7140": 240,
            "D6010": 2500,
            "D6065": 1700,
        },
        cash_prices={},
    ),
    Provider(
        # Refers root canals and crowns out.
        id="noda-family",
        name="NoDa Family Dentistry",
        lat=35.2470,
        lon=-80.8020,
        credentials=("DDS",),
        networks=frozenset({"summit-ppo-plus", "keystone-ppo"}),
        fees={"D1110": 105, "D1206": 30, "D2391": 175, "D7140": 195},
        cash_prices={},
    ),
    Provider(
        id="plaza-midwood",
        name="Plaza Midwood Dental",
        lat=35.2200,
        lon=-80.8100,
        credentials=("DDS",),
        networks=frozenset(),
        fees={
            "D1110": 140,
            "D1206": 50,
            "D2391": 240,
            "D3330": 1400,
            "D2740": 1500,
            "D7140": 260,
            "D6010": 2600,
            "D6065": 1750,
        },
        cash_prices={
            "D1110": 115,
            "D1206": 40,
            "D2391": 185,
            "D3330": 1100,
            "D2740": 1200,
            "D7140": 205,
            "D6010": 2200,
            "D6065": 1500,
        },
    ),
    Provider(
        # Specialist.
        id="ballantyne-endo",
        name="Ballantyne Endodontics",
        lat=35.0500,
        lon=-80.8500,
        credentials=("DDS", "Endodontist"),
        networks=frozenset(),
        fees={"D3330": 1500, "D2740": 1450},
        cash_prices={"D3330": 1200},
    ),
    Provider(
        id="dilworth-dental",
        name="Dilworth Dental Care",
        lat=35.2000,
        lon=-80.8450,
        credentials=("DMD",),
        networks=frozenset(),
        fees={
            "D1110": 125,
            "D1206": 40,
            "D2391": 210,
            "D3330": 1250,
            "D2740": 1350,
            "D7140": 230,
            "D6010": 2250,
            "D6065": 1500,
        },
        cash_prices={
            "D1110": 95,
            "D1206": 30,
            "D2391": 150,
            "D3330": 950,
            "D2740": 1000,
            "D7140": 170,
            "D6010": 1900,
            "D6065": 1250,
        },
    ),
    Provider(
        id="university-city",
        name="University City Dental",
        lat=35.3070,
        lon=-80.7350,
        credentials=("DMD",),
        networks=frozenset({"summit-ppo-plus", "harbor-ppo-basic"}),
        fees={
            "D1110": 110,
            "D1206": 35,
            "D2391": 180,
            "D3330": 1100,
            "D2740": 1200,
            "D7140": 200,
            "D6010": 2200,
            "D6065": 1450,
        },
        cash_prices={},
    ),
)

PLANS_BY_ID: dict[str, SamplePlan] = {s.plan.id: s for s in SAMPLE_PLANS}
PROCEDURES_BY_CODE: dict[str, Procedure] = {p.cdt_code: p for p in PROCEDURES}
PROVIDERS_BY_ID: dict[str, Provider] = {p.id: p for p in PROVIDERS}


def normalize_subscriber_id(raw: str) -> str:
    return raw.strip().upper()


def is_valid_subscriber_id(plan: Plan, subscriber_id: str) -> bool:
    return re.fullmatch(plan.subscriber_id_pattern, subscriber_id) is not None


def _check_member(s: SamplePlan) -> None:
    m, pid = s.default_member, s.plan.id
    as_of = date.fromisoformat(m.as_of)
    year_start = date.fromisoformat(s.plan.plan_year_start)
    # amount_used and deductible_met describe the plan year starting
    # plan_year_start, so as_of must fall inside it.
    if not year_start <= as_of < year_start.replace(year=year_start.year + 1):
        raise ValueError(f"plan {pid}: as_of is outside the current plan year")
    if date.fromisoformat(m.coverage_start) > as_of:
        raise ValueError(f"plan {pid}: coverage starts after as_of")
    history = m.past_services
    if any(h.cdt_code not in PROCEDURES_BY_CODE for h in history):
        raise ValueError(f"plan {pid}: past service has unknown procedure")
    dates = [date.fromisoformat(h.date_of_service) for h in history]
    if dates != sorted(dates):
        raise ValueError(f"plan {pid}: past services must be oldest first")
    if dates and dates[-1] > as_of:
        raise ValueError(f"plan {pid}: past service after as_of")
    f = m.fsa
    if f is None:
        return
    year_end = date.fromisoformat(f.year_end)
    if year_end < as_of:
        raise ValueError(f"plan {pid}: FSA year ended before as_of")
    if f.grace_period_end is not None:
        if f.carryover_limit:
            raise ValueError(f"plan {pid}: FSA has both a grace period and carryover")
        if date.fromisoformat(f.grace_period_end) <= year_end:
            raise ValueError(f"plan {pid}: FSA grace period ends before the year")
    if not 0 <= f.balance <= f.election_limit or f.carryover_limit < 0:
        raise ValueError(f"plan {pid}: FSA amounts out of range")
    if not 0 <= f.marginal_tax_rate < 1:
        raise ValueError(f"plan {pid}: FSA tax rate must be in [0, 1)")


def _check() -> None:
    if len(PLANS_BY_ID) != len(SAMPLE_PLANS):
        raise ValueError("duplicate plan id")
    if len(PROCEDURES_BY_CODE) != len(PROCEDURES):
        raise ValueError("duplicate procedure code")
    for p in PROCEDURES:
        if p.treats_state not in STATE_INDEX:
            raise ValueError(f"procedure {p.cdt_code} treats unknown state")
    if TREATMENT_FOR_STATE.keys() != STATE_INDEX.keys():
        raise ValueError("TREATMENT_FOR_STATE needs exactly one entry per state")
    for state, codes in TREATMENT_FOR_STATE.items():
        for code in codes:
            if code not in PROCEDURES_BY_CODE:
                raise ValueError(f"treatment for {state}: unknown procedure {code}")
            if PROCEDURES_BY_CODE[code].treats_state != state:
                raise ValueError(f"treatment for {state}: {code} treats another state")
    for s in SAMPLE_PLANS:
        if not is_valid_subscriber_id(s.plan, s.plan.subscriber_id_example):
            raise ValueError(f"plan {s.plan.id}: example ID fails its pattern")
        for schedule in (s.plan.in_network_fees, s.plan.out_of_network_allowed):
            if schedule.keys() != PROCEDURES_BY_CODE.keys():
                raise ValueError(
                    f"plan {s.plan.id}: fee schedule must price every procedure"
                )
        _check_member(s)
    if ALL_PLANS != PLANS_BY_ID.keys():
        raise ValueError("ALL_PLANS is out of date")
    if len(PROVIDERS_BY_ID) != len(PROVIDERS):
        raise ValueError("duplicate provider id")
    for d in PROVIDERS:
        if not d.networks <= PLANS_BY_ID.keys():
            raise ValueError(f"provider {d.id}: unknown plan in networks")
        if not d.fees.keys() <= PROCEDURES_BY_CODE.keys():
            raise ValueError(f"provider {d.id}: fee for unknown procedure")
        if not d.cash_prices.keys() <= d.fees.keys():
            raise ValueError(f"provider {d.id}: cash price for a procedure not offered")


_check()
