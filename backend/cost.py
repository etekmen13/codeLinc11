"""Cost engine: what one procedure costs a member, insured and in cash.

adjudicate() prices one claim against a member's benefit state and returns
the state after it. adjudicate_sequence() threads that state through a
schedule of claims, which is what the Monte Carlo and the "treat now vs.
split across the plan-year reset" comparison call.

Amounts are integer cents inside the engine, to avoid float drift over a
sequence. The catalog holds float dollars; they are converted on the way in.
Results stay in cents: convert with to_dollars() at the API.

Pure logic, no HTTP.
"""

import calendar
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Literal

from catalog import FrequencyLimit, MemberStatus, Plan, Procedure, Provider

Cents = int
Network = Literal["in", "out"]
PaymentPath = Literal["insured", "cash"]
DenialReason = Literal["waiting_period", "frequency_limit"]


# Money


def cents(dollars: float) -> Cents:
    return round(dollars * 100)


def to_dollars(amount: Cents) -> float:
    return amount / 100


def pct_of(pct: int, amount: Cents) -> Cents:
    """pct% of amount, rounded half up to the nearest cent."""
    if amount < 0:
        raise ValueError(f"pct_of called with negative amount {amount}")
    return (pct * amount + 50) // 100


def fmt(amount: Cents) -> str:
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    return f"{sign}${amount // 100:,}.{amount % 100:02d}"


# Types


@dataclass(frozen=True)
class Claim:
    procedure: Procedure
    provider: Provider
    date_of_service: date


@dataclass(frozen=True)
class ServiceRecord:
    cdt_code: str
    date_of_service: date


@dataclass(frozen=True)
class BenefitState:
    """A member's benefits in one plan year. The engine returns a new state
    rather than changing this one, so a sequencer can branch from any state
    without copying."""

    plan_year_start: date  # the plan year this state describes
    deductible_remaining: Cents
    max_remaining: Cents
    coverage_start: date  # waiting periods count from here
    history: tuple[ServiceRecord, ...] = ()  # insured services, chronological


@dataclass(frozen=True)
class TraceStep:
    rule: str
    message: str
    values: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class InsuredPath:
    eligible: bool
    denial_reason: DenialReason | None
    provider_fee: Cents  # what the dentist bills
    allowed_amount: Cents  # what the plan recognizes
    deductible_applied: Cents
    coinsurance_pct: int
    plan_pays: Cents
    you_pay: Cents
    balance_billing: Cents
    new_state: BenefitState


@dataclass(frozen=True)
class CashPath:
    price: Cents


@dataclass(frozen=True)
class AdjudicationResult:
    claim: Claim
    network: Network
    insured: InsuredPath
    cash: CashPath | None  # None if the provider has no cash price for it
    # The input state after any plan-year rollover; also the state after cash.
    state_before: BenefitState
    trace: tuple[TraceStep, ...]
    assumptions: tuple[str, ...]

    def _require_cash(self) -> CashPath:
        if self.cash is None:
            raise ValueError(
                f"{self.claim.provider.name} has no cash price for "
                f"{self.claim.procedure.cdt_code}"
            )
        return self.cash

    def state_after(self, path: PaymentPath) -> BenefitState:
        if path == "insured":
            return self.insured.new_state
        self._require_cash()
        return self.state_before

    def you_pay(self, path: PaymentPath) -> Cents:
        if path == "insured":
            return self.insured.you_pay
        return self._require_cash().price

    @property
    def lowest_you_pay(self) -> Cents:
        """Default sort key: the cheaper path for the member."""
        if self.cash is None:
            return self.insured.you_pay
        return min(self.insured.you_pay, self.cash.price)

    @property
    def benefit_consumed(self) -> Cents:
        """How much annual maximum the insured path uses."""
        return self.state_before.max_remaining - self.insured.new_state.max_remaining


def initial_state(plan: Plan, member: MemberStatus) -> BenefitState:
    """The benefit state for the plan year starting plan.plan_year_start,
    with the member's past services as history."""
    return BenefitState(
        plan_year_start=date.fromisoformat(plan.plan_year_start),
        deductible_remaining=max(0, cents(plan.deductible - member.deductible_met)),
        max_remaining=max(0, cents(plan.annual_maximum - member.amount_used)),
        coverage_start=date.fromisoformat(member.coverage_start),
        history=tuple(
            ServiceRecord(s.cdt_code, date.fromisoformat(s.date_of_service))
            for s in member.past_services
        ),
    )


def network_status(plan: Plan, provider: Provider) -> Network:
    return "in" if plan.id in provider.networks else "out"


# Plan year


def add_months(d: date, months: int) -> date:
    """Shift d by whole months, clamping the day to the target month's length."""
    index = d.month - 1 + months
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def plan_year_containing(d: date, plan: Plan) -> date:
    """Start of the plan year containing d."""
    start = date.fromisoformat(plan.plan_year_start)
    years = d.year - start.year
    begin = add_months(start, 12 * years)
    return begin if d >= begin else add_months(start, 12 * (years - 1))


def roll_to_plan_year(
    state: BenefitState, service_date: date, plan: Plan
) -> tuple[BenefitState, list[TraceStep], list[str]]:
    """Return the state for the plan year containing service_date.

    Same plan year: unchanged. Later plan year: deductible and maximum reset,
    history kept, because frequency windows read dates and old records age
    out on their own. Earlier plan year: error, since the state no longer
    describes that year.
    """
    begin = plan_year_containing(service_date, plan)
    if begin == state.plan_year_start:
        return state, [], []
    if begin < state.plan_year_start:
        raise ValueError(
            f"Service date {service_date} precedes the state's plan year "
            f"({state.plan_year_start})."
        )
    deductible, maximum = cents(plan.deductible), cents(plan.annual_maximum)
    rolled = replace(
        state,
        plan_year_start=begin,
        deductible_remaining=deductible,
        max_remaining=maximum,
    )
    trace = [
        TraceStep(
            "plan_year",
            f"Service falls in the plan year starting {begin}. The deductible "
            f"resets to {fmt(deductible)} and the annual maximum to {fmt(maximum)}.",
            {"plan_year_start": begin.isoformat()},
        )
    ]
    assumptions = [
        f"Assumes the same plan and continuous enrollment from {begin}.",
    ]
    return rolled, trace, assumptions


# Eligibility


def check_eligibility(
    claim: Claim, state: BenefitState, plan: Plan
) -> tuple[DenialReason | None, list[TraceStep]]:
    proc, dos = claim.procedure, claim.date_of_service
    label = proc.category.capitalize()
    trace: list[TraceStep] = []

    # A zero-month wait still denies services before coverage starts.
    wait = plan.waiting_period_months[proc.category]
    eligible_from = add_months(state.coverage_start, wait)
    ok = dos >= eligible_from
    if wait or not ok:
        trace.append(
            TraceStep(
                "waiting_period",
                f"{label} services have a {wait}-month waiting period from "
                f"coverage start ({state.coverage_start}), so they are covered "
                f"from {eligible_from}. "
                + ("Satisfied." if ok else "Not yet satisfied."),
                {"waiting_months": wait, "eligible_from": eligible_from.isoformat()},
            )
        )
    if not ok:
        return "waiting_period", trace

    limit = next(
        (f for f in plan.frequency_limits if f.cdt_code == proc.cdt_code), None
    )
    if limit is not None:
        used = _count_in_window(limit, dos, state)
        ok = used < limit.count
        trace.append(
            TraceStep(
                "frequency",
                f"Frequency limit is {limit.count} per {limit.per_months} months; "
                f"{used} already used. "
                + ("Within limit." if ok else "Limit reached."),
                {"limit": limit.count, "used": used},
            )
        )
        if not ok:
            return "frequency_limit", trace

    return None, trace


def _count_in_window(limit: FrequencyLimit, dos: date, state: BenefitState) -> int:
    # A prior service exactly N months earlier has aged out, so "once per 6
    # months" after Jan 15 becomes eligible on Jul 15.
    cutoff = add_months(dos, -limit.per_months)
    return sum(
        1
        for r in state.history
        if r.cdt_code == limit.cdt_code and cutoff < r.date_of_service <= dos
    )


# Pipeline


def adjudicate(claim: Claim, state: BenefitState, plan: Plan) -> AdjudicationResult:
    proc, prov = claim.procedure, claim.provider
    _validate(claim, state)

    # 1. Plan year
    state, trace, assumptions = roll_to_plan_year(state, claim.date_of_service, plan)

    # 2. Allowed amount (before eligibility, so a denial can report it)
    network = network_status(plan, prov)
    billed = _lookup(prov.fees, proc.cdt_code, f"fee at {prov.name}")
    if network == "in":
        base = _lookup(plan.in_network_fees, proc.cdt_code, "in-network fee")
        source = "negotiated fee"
    else:
        base = _lookup(plan.out_of_network_allowed, proc.cdt_code, "allowed amount")
        source = "plan's out-of-network allowed amount"
    # A plan never allows more than the dentist charged.
    allowed = min(base, billed)
    trace.append(
        TraceStep(
            "allowed_amount",
            f"{prov.name} is {network} network. Billed fee {fmt(billed)}; "
            f"allowed amount is the {source}, {fmt(allowed)}."
            + (" (Capped at the billed fee.)" if allowed < base else ""),
            {"network": network, "provider_fee": billed, "allowed_amount": allowed},
        )
    )

    # 3. Eligibility
    denial, elig_trace = check_eligibility(claim, state, plan)
    trace.extend(elig_trace)

    if denial is not None:
        insured = _denied_path(denial, network, billed, allowed, state, trace)
    else:
        insured = _covered_path(claim, network, billed, allowed, state, plan, trace)

    cash = None
    if proc.cdt_code in prov.cash_prices:
        cash = CashPath(cents(prov.cash_prices[proc.cdt_code]))
        trace.append(
            TraceStep(
                "cash_path",
                f"Cash price at {prov.name} is {fmt(cash.price)}. Paying cash "
                f"leaves the deductible and annual maximum unchanged.",
                {"cash_price": cash.price},
            )
        )

    return AdjudicationResult(
        claim=claim,
        network=network,
        insured=insured,
        cash=cash,
        state_before=state,
        trace=tuple(trace),
        assumptions=tuple(assumptions),
    )


def adjudicate_sequence(
    claims: Sequence[Claim],
    state: BenefitState,
    plan: Plan,
    paths: Sequence[PaymentPath] | None = None,
) -> tuple[list[AdjudicationResult], BenefitState]:
    """Adjudicate claims in the given order, threading state.

    Claims must be in date order. Within one visit the first claim absorbs
    the deductible; insurers differ on line-item order, so the caller
    controls it. paths defaults to insured for every claim.
    """
    chosen: list[PaymentPath] = (
        list(paths) if paths is not None else ["insured"] * len(claims)
    )
    if len(chosen) != len(claims):
        raise ValueError("paths must have one entry per claim")
    results = []
    for claim, path in zip(claims, chosen, strict=True):
        result = adjudicate(claim, state, plan)
        results.append(result)
        state = result.state_after(path)
    return results, state


def _covered_path(
    claim: Claim,
    network: Network,
    billed: Cents,
    allowed: Cents,
    state: BenefitState,
    plan: Plan,
    trace: list[TraceStep],
) -> InsuredPath:
    cat = claim.procedure.category
    D, M = state.deductible_remaining, state.max_remaining

    # 4. Deductible
    if cat not in plan.deductible_applies_to:
        d = 0
        trace.append(
            TraceStep("deductible", f"The deductible does not apply to {cat} services.")
        )
    else:
        d = min(D, allowed)
        trace.append(
            TraceStep(
                "deductible",
                f"Deductible: {fmt(d)} applied ({fmt(D)} remaining before this claim).",
                {"applied": d, "remaining_before": D},
            )
        )

    # 5. Coinsurance and annual maximum. The plan has one coinsurance rate;
    # out of network it applies to the lower allowed amount.
    c = round(plan.coinsurance[cat] * 100)
    share = pct_of(c, allowed - d)
    trace.append(
        TraceStep(
            "coinsurance",
            f"Plan covers {c}% of {cat} services: {c}% of {fmt(allowed - d)} = "
            f"{fmt(share)}.",
            {"pct": c, "base": allowed - d, "share": share},
        )
    )
    plan_pays = min(share, M)
    if plan_pays < share:
        msg = f"Annual maximum: plan share capped at the {fmt(M)} remaining."
    else:
        msg = f"Annual maximum: {fmt(M)} remaining, not binding."
    trace.append(
        TraceStep("annual_max", msg, {"remaining_before": M, "plan_pays": plan_pays})
    )

    # 6. Member share
    balance = billed - allowed if network == "out" else 0
    you_pay = (allowed - plan_pays) + balance
    trace.append(
        TraceStep(
            "you_pay",
            f"You pay {fmt(allowed - plan_pays)} of the allowed amount"
            + (f" plus a {fmt(balance)} balance bill" if balance else "")
            + f", {fmt(you_pay)} total.",
            {
                "share_of_allowed": allowed - plan_pays,
                "balance_billing": balance,
                "you_pay": you_pay,
            },
        )
    )

    # 7. State update
    new_state = replace(
        state,
        deductible_remaining=D - d,
        max_remaining=M - plan_pays,
        history=state.history
        + (ServiceRecord(claim.procedure.cdt_code, claim.date_of_service),),
    )
    return InsuredPath(
        eligible=True,
        denial_reason=None,
        provider_fee=billed,
        allowed_amount=allowed,
        deductible_applied=d,
        coinsurance_pct=c,
        plan_pays=plan_pays,
        you_pay=you_pay,
        balance_billing=balance,
        new_state=new_state,
    )


def _denied_path(
    reason: DenialReason,
    network: Network,
    billed: Cents,
    allowed: Cents,
    state: BenefitState,
    trace: list[TraceStep],
) -> InsuredPath:
    # In network, the negotiated fee is assumed to still cap the charge. That
    # depends on the provider contract and state law on non-covered services.
    owed = allowed if network == "in" else billed
    trace.append(
        TraceStep(
            "denial",
            f"Not covered ({reason}). Plan pays $0.00; you pay {fmt(owed)}. "
            f"Benefits are unchanged.",
            {"reason": reason, "you_pay": owed},
        )
    )
    return InsuredPath(
        eligible=False,
        denial_reason=reason,
        provider_fee=billed,
        allowed_amount=allowed,
        deductible_applied=0,
        coinsurance_pct=0,
        plan_pays=0,
        you_pay=owed,
        balance_billing=billed - allowed if network == "out" else 0,
        new_state=state,
    )


def _validate(claim: Claim, state: BenefitState) -> None:
    # Chronological order keeps frequency checks simple: a later record can
    # never retroactively invalidate an earlier claim.
    if state.history:
        latest = max(r.date_of_service for r in state.history)
        if claim.date_of_service < latest:
            raise ValueError(
                f"Claims must be adjudicated chronologically: "
                f"{claim.date_of_service} precedes a recorded service on {latest}."
            )


def _lookup(table: dict[str, float], code: str, what: str) -> Cents:
    try:
        return cents(table[code])
    except KeyError:
        raise ValueError(f"No {what} for procedure {code}") from None
