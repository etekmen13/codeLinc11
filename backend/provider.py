"""Find Providers: dentists filtered by radius and procedure, in two columns
(in-network, out-of-network), each sorted by what the employee pays.

Dentists come from the catalog. Pricing comes from the cost engine, which
applies the member's deductible, coinsurance, annual maximum, waiting
periods, and frequency limits, and reports a cash price where there is one.

Main entry: find_providers(procedure_code, plan, member, ...)

Endpoint:
  POST /api/providers   OnboardingRequest plus filters -> ProvidersOut

Like onboarding, the backend keeps no session: the request carries the
onboarding answers and is validated with validate_onboarding.
"""

import math
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import cost
from catalog import PROCEDURES_BY_CODE, PROVIDERS, MemberStatus, Plan, Provider
from onboarding import InvalidOnboarding, OnboardingRequest, validate_onboarding

EXAMPLE_USER_LOCATION = (35.2271, -80.8431)  # Charlotte, NC


def distance_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle (haversine) distance between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 3958.8 * 2 * math.asin(math.sqrt(h))


# Response models. Field names match frontend/src/types.ts.


class CostOut(BaseModel):
    """One procedure at one dentist on the insured path, in dollars. The
    fields through annual_maximum_remaining are the line item the care-plan
    explanation takes."""

    procedure: str  # CDT code
    provider: str
    in_network: bool
    provider_fee: float
    deductible_applied: float
    plan_pays: float
    you_pay: float
    balance_billing: float
    annual_maximum_remaining: float
    allowed_amount: float
    covered: bool
    denial_reason: cost.DenialReason | None
    cash_price: float | None  # None if the dentist has no self-pay price
    explanation: list[str]  # one sentence per pricing step
    assumptions: list[str]


class ProviderCard(BaseModel):
    id: str
    name: str
    distance_miles: float
    credentials: list[str]
    in_network: bool
    cost: CostOut


class ProvidersOut(BaseModel):
    procedure: str
    date_of_service: date
    in_network: list[ProviderCard]
    out_of_network: list[ProviderCard]


def cost_out(r: cost.AdjudicationResult) -> CostOut:
    ins, dollars = r.insured, cost.to_dollars
    return CostOut(
        procedure=r.claim.procedure.cdt_code,
        provider=r.claim.provider.name,
        in_network=r.network == "in",
        provider_fee=dollars(ins.provider_fee),
        deductible_applied=dollars(ins.deductible_applied),
        plan_pays=dollars(ins.plan_pays),
        you_pay=dollars(ins.you_pay),
        balance_billing=dollars(ins.balance_billing),
        annual_maximum_remaining=dollars(ins.new_state.max_remaining),
        allowed_amount=dollars(ins.allowed_amount),
        covered=ins.eligible,
        denial_reason=ins.denial_reason,
        cash_price=None if r.cash is None else dollars(r.cash.price),
        explanation=[step.message for step in r.trace],
        assumptions=list(r.assumptions),
    )


def find_providers(
    procedure_code: str,
    plan: Plan,
    member: MemberStatus,
    date_of_service: date | None = None,
    providers: tuple[Provider, ...] = PROVIDERS,
    user_location: tuple[float, float] = EXAMPLE_USER_LOCATION,
    radius_miles: float = 25.0,
) -> ProvidersOut:
    """Dentists within `radius_miles` that do the procedure, in two columns,
    each sorted by what you pay (cheapest first). date_of_service defaults
    to the member's as_of date; a later plan year resets the deductible and
    maximum."""
    procedure = PROCEDURES_BY_CODE.get(procedure_code)
    if procedure is None:
        raise ValueError(f"unknown procedure {procedure_code!r}")
    dos = date_of_service or date.fromisoformat(member.as_of)
    state = cost.initial_state(plan, member)

    in_network: list[ProviderCard] = []
    out_of_network: list[ProviderCard] = []
    for d in providers:
        if procedure_code not in d.fees:  # doesn't do this procedure
            continue
        miles = distance_miles(user_location, (d.lat, d.lon))
        if miles > radius_miles:  # too far
            continue
        result = cost.adjudicate(cost.Claim(procedure, d, dos), state, plan)
        card = ProviderCard(
            id=d.id,
            name=d.name,
            distance_miles=round(miles, 1),
            credentials=list(d.credentials),
            in_network=result.network == "in",
            cost=cost_out(result),
        )
        (in_network if card.in_network else out_of_network).append(card)

    for column in (in_network, out_of_network):
        column.sort(key=lambda c: c.cost.you_pay)
    return ProvidersOut(
        procedure=procedure_code,
        date_of_service=dos,
        in_network=in_network,
        out_of_network=out_of_network,
    )


class ProvidersRequest(OnboardingRequest):
    radius_miles: float = Field(25.0, gt=0)
    date_of_service: date | None = None  # defaults to the member's as_of


router = APIRouter(prefix="/api", tags=["providers"])


@router.post("/providers")
def post_providers(req: ProvidersRequest) -> ProvidersOut:
    try:
        o = validate_onboarding(req)
    except InvalidOnboarding as e:
        raise HTTPException(422, e.problems) from e
    try:
        return find_providers(
            o.procedure.cdt_code,
            o.plan,
            o.member,
            req.date_of_service,
            radius_miles=req.radius_miles,
        )
    except ValueError as e:  # e.g. a date before the member's history
        raise HTTPException(422, [str(e)]) from e
