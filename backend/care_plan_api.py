"""Care plan endpoints: the sequencer's options for one procedure, in
dollars.

Flow: compare dentists, each priced on their own lowest-cost schedule, then
lay out the full plan for the dentist the member picks. Both endpoints run
the same seeded simulations, so a dentist's card in the comparison matches
their plan.

Endpoints:
  POST /api/care-plan/compare    OnboardingRequest plus radius and risk
                                 tolerance -> ComparisonOut
  POST /api/care-plan/sequence   OnboardingRequest plus the chosen dentist
                                 and risk tolerance -> CarePlanOut

Like onboarding and providers, the backend keeps no session: the request
carries the onboarding answers and is validated with validate_onboarding.
The numbers are deterministic for a given request (seeded simulations).

The sequencer works in cents; everything here is converted to dollars.
Expected values are rounded to the cent.
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from catalog import PROCEDURES_BY_CODE, PROVIDERS_BY_ID, Provider
from cost import DenialReason, PaymentPath, to_dollars
from monte_carlo import RISK_BANDS, OutcomeSummary, RiskBand
from onboarding import (
    InvalidOnboarding,
    Onboarded,
    OnboardingRequest,
    validate_onboarding,
)
from sequencer import (
    DEFAULT_RADIUS_MILES,
    TAIL_WEIGHT,
    CarePlan,
    Comparison,
    CostStats,
    DentistOption,
    FsaTracker,
    Line,
    MaximumUsage,
    Option,
    Reminder,
    Savings,
    compare_care,
    plan_care,
)


def dollars(amount: float) -> float:
    """Cents, possibly fractional (an expected value), to dollars and cents."""
    return round(amount) / 100


# Response models. Field names match frontend/src/types.ts.


class LineOut(BaseModel):
    cdt_code: str
    procedure_name: str
    provider_id: str  # differs from the chosen dentist for a referral
    provider_name: str
    in_network: bool
    path: PaymentPath
    provider_fee: float
    plan_pays: float
    you_pay: float
    denial_reason: DenialReason | None


class VisitOut(BaseModel):
    date: date
    tooth_state: str
    lines: list[LineOut]  # billing order; empty if nothing is needed
    plan_pays: float
    you_pay: float


class OutcomeOut(BaseModel):
    probability: float
    visit: VisitOut


class CostStatsOut(BaseModel):
    mean: float
    p5: float
    p95: float
    cvar95: float  # mean of the costliest 5% of futures


class FsaSummaryOut(BaseModel):
    election: float
    from_balance: float
    from_election: float
    balance_unused: float
    forfeited: float


class OptionOut(BaseModel):
    date: date
    path: PaymentPath
    labels: list[str]  # why the date was priced, e.g. "after_plan_reset"
    month: int
    escalation_probability: float
    band: str
    outcomes: list[OutcomeOut]  # most likely first
    member_share: CostStatsOut  # what the member owes the dentists
    cost: CostStatsOut  # after FSA and tax
    fsa: FsaSummaryOut


class SavingsOut(BaseModel):
    mean: float
    p5: float
    p95: float
    probability_costs_more: float


class MaximumUsageOut(BaseModel):
    plan_year_start: date
    resets_on: date
    annual_maximum: float
    used: float
    scheduled: float
    remaining: float


class FsaTrackerOut(BaseModel):
    balance: float
    spend_deadline: date
    carryover_limit: float
    spent: float
    unused: float
    forfeited: float
    election: float
    election_quantile: float


class ReminderOut(BaseModel):
    kind: str
    deadline: date
    amount: float
    message: str


class CarePlanOut(BaseModel):
    as_of: date
    provider_id: str
    tolerance: str
    tail_weight: float
    risk_bands: list[RiskBand]  # the tolerances a request can choose from
    options: list[OptionOut]  # date order
    lowest_cost: OptionOut
    baseline: OptionOut
    savings: SavingsOut
    lever_savings: dict[str, float]
    beyond_tolerance: OptionOut | None
    beyond_tolerance_savings: SavingsOut | None
    maximum: list[MaximumUsageOut]
    fsa: FsaTrackerOut | None
    reminders: list[ReminderOut]
    risk: OutcomeSummary
    assumptions: list[str]


class DentistOptionOut(BaseModel):
    provider_id: str
    name: str
    distance_miles: float
    credentials: list[str]
    in_network: bool
    lowest_cost: OptionOut  # this dentist's lowest-cost option
    baseline: OptionOut  # this dentist, earliest date, insured
    savings: SavingsOut  # baseline minus lowest_cost


class ComparisonOut(BaseModel):
    as_of: date
    procedure: str  # CDT code
    tolerance: str
    tail_weight: float
    risk_bands: list[RiskBand]
    # Each column sorted by the expected cost of each dentist's lowest-cost
    # option, nearest first on ties
    in_network: list[DentistOptionOut]
    out_of_network: list[DentistOptionOut]
    risk: OutcomeSummary
    assumptions: list[str]


def line_out(x: Line) -> LineOut:
    return LineOut(
        cdt_code=x.cdt_code,
        procedure_name=PROCEDURES_BY_CODE[x.cdt_code].name,
        provider_id=x.provider_id,
        provider_name=PROVIDERS_BY_ID[x.provider_id].name,
        in_network=x.network == "in",
        path=x.path,
        provider_fee=to_dollars(x.provider_fee),
        plan_pays=to_dollars(x.plan_pays),
        you_pay=to_dollars(x.you_pay),
        denial_reason=x.denial_reason,
    )


def stats_out(c: CostStats) -> CostStatsOut:
    return CostStatsOut(
        mean=dollars(c.mean),
        p5=dollars(c.p5),
        p95=dollars(c.p95),
        cvar95=dollars(c.cvar95),
    )


def option_out(x: Option) -> OptionOut:
    return OptionOut(
        date=x.date,
        path=x.path,
        labels=list(x.labels),
        month=x.month,
        escalation_probability=x.escalation_probability,
        band=x.band,
        outcomes=[
            OutcomeOut(
                probability=outcome.probability,
                visit=VisitOut(
                    date=outcome.visit.date,
                    tooth_state=outcome.visit.tooth_state,
                    lines=[line_out(line) for line in outcome.visit.lines],
                    plan_pays=to_dollars(outcome.visit.plan_pays),
                    you_pay=to_dollars(outcome.visit.you_pay),
                ),
            )
            for outcome in x.outcomes
        ],
        member_share=stats_out(x.member_share),
        cost=stats_out(x.cost),
        fsa=FsaSummaryOut(
            election=dollars(x.fsa.election),
            from_balance=dollars(x.fsa.from_balance),
            from_election=dollars(x.fsa.from_election),
            balance_unused=dollars(x.fsa.balance_unused),
            forfeited=dollars(x.fsa.forfeited),
        ),
    )


def savings_out(s: Savings) -> SavingsOut:
    return SavingsOut(
        mean=dollars(s.mean),
        p5=dollars(s.p5),
        p95=dollars(s.p95),
        probability_costs_more=s.probability_costs_more,
    )


def maximum_out(m: MaximumUsage) -> MaximumUsageOut:
    return MaximumUsageOut(
        plan_year_start=m.plan_year_start,
        resets_on=m.resets_on,
        annual_maximum=to_dollars(m.annual_maximum),
        used=to_dollars(m.used),
        scheduled=dollars(m.scheduled),
        remaining=dollars(m.remaining),
    )


def fsa_out(f: FsaTracker) -> FsaTrackerOut:
    return FsaTrackerOut(
        balance=to_dollars(f.balance),
        spend_deadline=f.spend_deadline,
        carryover_limit=to_dollars(f.carryover_limit),
        spent=dollars(f.spent),
        unused=dollars(f.unused),
        forfeited=dollars(f.forfeited),
        election=dollars(f.election),
        election_quantile=f.election_quantile,
    )


def reminder_out(r: Reminder) -> ReminderOut:
    return ReminderOut(
        kind=r.kind, deadline=r.deadline, amount=dollars(r.amount), message=r.message
    )


def care_plan_out(p: CarePlan, bands: tuple[RiskBand, ...]) -> CarePlanOut:
    beyond = p.beyond_tolerance
    beyond_savings = p.beyond_tolerance_savings
    return CarePlanOut(
        as_of=p.as_of,
        provider_id=p.provider_id,
        tolerance=p.tolerance,
        tail_weight=p.tail_weight,
        risk_bands=list(bands),
        options=[option_out(x) for x in p.options],
        lowest_cost=option_out(p.lowest_cost),
        baseline=option_out(p.baseline),
        savings=savings_out(p.savings),
        lever_savings={k: dollars(v) for k, v in p.lever_savings.items()},
        beyond_tolerance=option_out(beyond) if beyond else None,
        beyond_tolerance_savings=savings_out(beyond_savings)
        if beyond_savings
        else None,
        maximum=[maximum_out(m) for m in p.maximum],
        fsa=fsa_out(p.fsa) if p.fsa else None,
        reminders=[reminder_out(r) for r in p.reminders],
        risk=p.risk,
        assumptions=list(p.assumptions),
    )


def dentist_out(d: DentistOption) -> DentistOptionOut:
    return DentistOptionOut(
        provider_id=d.provider_id,
        name=d.name,
        distance_miles=d.distance_miles,
        credentials=list(d.credentials),
        in_network=d.in_network,
        lowest_cost=option_out(d.lowest_cost),
        baseline=option_out(d.baseline),
        savings=savings_out(d.savings),
    )


def comparison_out(
    c: Comparison, procedure: str, bands: tuple[RiskBand, ...]
) -> ComparisonOut:
    return ComparisonOut(
        as_of=c.as_of,
        procedure=procedure,
        tolerance=c.tolerance,
        tail_weight=c.tail_weight,
        risk_bands=list(bands),
        in_network=[dentist_out(d) for d in c.in_network],
        out_of_network=[dentist_out(d) for d in c.out_of_network],
        risk=c.risk,
        assumptions=list(c.assumptions),
    )


class PlanningRequest(OnboardingRequest):
    risk_tolerance: str = RISK_BANDS[0].name  # a risk band name
    tail_weight: float = Field(TAIL_WEIGHT, ge=0)


class CompareRequest(PlanningRequest):
    radius_miles: float = Field(DEFAULT_RADIUS_MILES, gt=0)


class CarePlanRequest(PlanningRequest):
    provider_id: str


def validate_planning(
    req: PlanningRequest, provider_id: str | None = None
) -> tuple[Onboarded, Provider | None]:
    """Raise a 422 listing every problem, so one round trip shows everything
    to fix. provider_id, if given, must name a known dentist."""
    problems: list[str] = []
    o: Onboarded | None = None
    try:
        o = validate_onboarding(req)
    except InvalidOnboarding as e:
        problems += e.problems
    dentist = None
    if provider_id is not None:
        dentist = PROVIDERS_BY_ID.get(provider_id)
        if dentist is None:
            problems.append(f"unknown provider {provider_id!r}")
    names = [b.name for b in RISK_BANDS]
    if req.risk_tolerance not in names:
        problems.append(
            f"unknown risk tolerance {req.risk_tolerance!r}; use one of {names}"
        )
    if problems or o is None:
        raise HTTPException(422, problems)
    return o, dentist


router = APIRouter(prefix="/api/care-plan", tags=["care-plan"])


@router.post("/compare")
def post_compare(req: CompareRequest) -> ComparisonOut:
    o, _ = validate_planning(req)
    comparison = compare_care(o, req.risk_tolerance, req.tail_weight, req.radius_miles)
    return comparison_out(comparison, o.procedure.cdt_code, RISK_BANDS)


@router.post("/sequence")
def post_sequence(req: CarePlanRequest) -> CarePlanOut:
    o, dentist = validate_planning(req, req.provider_id)
    assert dentist is not None  # validate_planning checked provider_id
    try:
        plan = plan_care(o, dentist, req.risk_tolerance, req.tail_weight)
    except ValueError as e:  # e.g. the dentist does not offer the procedure
        raise HTTPException(422, [str(e)]) from e
    return care_plan_out(plan, RISK_BANDS)
