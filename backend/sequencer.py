"""Care-plan sequencer: when to have the procedure and how to pay for it,
laid out as options with their costs and risks across simulated futures.

The Monte Carlo gives each future's tooth state month by month, the cost
engine prices whatever that state needs on a given date, and fsa.py says how
the member's share is paid. An option is a date and a payment path for the
procedure the member picked. If the tooth has changed by that date, the
option prices what the tooth needs then (catalog.TREATMENT_FOR_STATE).

This module informs; it does not prescribe care. Options outside the
member's risk tolerance are still reported with what they would cost.

Every option is scored on the same simulated futures, so differences between
options come from the options, not sampling noise. Pricing depends only on
(dentist, date, tooth state, path), so each combination is priced once with
the cost engine and shared by every future that reaches it.

v0 scope: one tooth, one visit per option, the provider the member chose.
Amounts are cents.

Pure logic, no HTTP.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import combinations
from math import factorial

import numpy as np
from numpy.typing import NDArray

import fsa
from catalog import (
    PROCEDURES_BY_CODE,
    PROVIDERS,
    TREATMENT_FOR_STATE,
    Plan,
    Procedure,
    Provider,
)
from cost import (
    BenefitState,
    Cents,
    Claim,
    DenialReason,
    Network,
    PaymentPath,
    add_months,
    adjudicate,
    check_eligibility,
    initial_state,
    plan_year_containing,
)
from handoff import N_SAMPLES
from monte_carlo import (
    RISK_BANDS,
    OutcomeSummary,
    RiskBand,
    SimulationResult,
    risk_band,
    simulate,
)
from onboarding import Onboarded
from progression import STATES
from provider import EXAMPLE_USER_LOCATION, distance_miles

# Visits placed around each plan-year reset: two weeks before, and the
# first working days after.
BEFORE_RESET_DAYS = 14
AFTER_RESET_DAYS = 3

# Smallest expected saving worth a "switch dentists" hint, in cents.
HINT_MIN_SAVINGS = 1000


# Dates


def months_between(start: date, d: date) -> int:
    """Whole months from start to d: the simulation month d falls in."""
    m = (d.year - start.year) * 12 + d.month - start.month
    return m - 1 if add_months(start, m) > d else m


@dataclass(frozen=True)
class CandidateDate:
    date: date
    # Why the date is worth pricing, e.g. "after_plan_reset"; a date can
    # have several reasons.
    labels: tuple[str, ...]


def candidate_dates(
    o: Onboarded,
    sim: SimulationResult,
    provider: Provider,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
) -> tuple[CandidateDate, ...]:
    """The few dates where cost or risk can change, within the horizon.

    Within one plan year the cost of a visit barely depends on its date,
    so only the dates where a rule changes are priced, plus the last date
    inside each risk band.
    """
    start, end = o.as_of, add_months(o.as_of, sim.horizon)
    found: dict[date, list[str]] = {}

    def add(d: date | None, label: str) -> None:
        if d is not None and start <= d <= end:
            found.setdefault(d, []).append(label)

    add(start, "earliest")

    reset = add_months(plan_year_containing(start, o.plan), 12)
    while reset <= end:
        add(reset - timedelta(days=BEFORE_RESET_DAYS), "before_plan_reset")
        add(reset + timedelta(days=AFTER_RESET_DAYS), "after_plan_reset")
        reset = add_months(reset, 12)

    wait = o.plan.waiting_period_months[o.procedure.category]
    waiting_ends = add_months(date.fromisoformat(o.member.coverage_start), wait)
    if waiting_ends > start:
        add(waiting_ends, "waiting_period_ends")

    add(frequency_limit_clears(o, provider), "frequency_limit_clears")

    if o.member.fsa is not None:
        add(fsa.rules(o.member.fsa).spend_deadline, "fsa_deadline")

    for band in bands[:-1]:
        assert band.upper is not None  # check_bands guarantees it
        leaves = np.flatnonzero(sim.risk >= band.upper)
        last = int(leaves[0]) - 1 if len(leaves) else sim.horizon
        if last >= 1:
            add(add_months(start, last), f"last_month_{band.name}_risk")

    return tuple(CandidateDate(d, tuple(found[d])) for d in sorted(found))


def frequency_limit_clears(o: Onboarded, provider: Provider) -> date | None:
    """The first date after as_of when the picked procedure's frequency
    limit allows it again, or None if it is allowed now (or never limited).
    Asks the cost engine, so the window rule lives in one place."""
    code = o.procedure.cdt_code
    limit = next((f for f in o.plan.frequency_limits if f.cdt_code == code), None)
    if limit is None:
        return None
    state = initial_state(o.plan, o.member)

    def limited(d: date) -> bool:
        denial, _ = check_eligibility(Claim(o.procedure, provider, d), state, o.plan)
        return denial == "frequency_limit"

    if not limited(o.as_of):
        return None
    ages_out = sorted(
        add_months(r.date_of_service, limit.per_months)
        for r in state.history
        if r.cdt_code == code
    )
    return next((d for d in ages_out if d > o.as_of and not limited(d)), None)


# Pricing


@dataclass(frozen=True)
class Line:
    """One procedure on a visit."""

    cdt_code: str
    provider_id: str
    network: Network
    path: PaymentPath
    provider_fee: Cents
    plan_pays: Cents
    you_pay: Cents
    denial_reason: DenialReason | None


@dataclass(frozen=True)
class Visit:
    """What a tooth in `tooth_state` needs on one date, priced."""

    date: date
    tooth_state: str
    lines: tuple[Line, ...]  # billing order; empty if nothing is needed
    benefits_after: BenefitState

    @property
    def you_pay(self) -> Cents:
        return sum(line.you_pay for line in self.lines)

    @property
    def plan_pays(self) -> Cents:
        return sum(line.plan_pays for line in self.lines)


def procedures_for(
    tooth_state: str, start_state: str, picked: Procedure
) -> tuple[Procedure, ...]:
    """The picked procedure if the tooth is as it was; otherwise what its
    state needs now, billed on one date (v0; v1 may split into visits). A
    routine visit for a healthy tooth still happens if a problem is found."""
    if tooth_state == start_state:
        return (picked,)
    needed = tuple(PROCEDURES_BY_CODE[c] for c in TREATMENT_FOR_STATE[tooth_state])
    return (picked, *needed) if start_state == "healthy" else needed


def provider_for(
    code: str,
    chosen: Provider,
    plan: Plan,
    providers: tuple[Provider, ...] = PROVIDERS,
) -> Provider:
    """The chosen dentist if they do the procedure; otherwise a referral to
    an in-network dentist who does, then the lowest billed fee."""
    if code in chosen.fees:
        return chosen
    offering = [d for d in providers if code in d.fees]
    if not offering:
        raise ValueError(f"no provider offers {code}")
    return min(offering, key=lambda d: (plan.id not in d.networks, d.fees[code], d.id))


class Pricer:
    """Prices visits with the cost engine from the member's benefits as of
    onboarding, caching each (dentist, date, tooth state, path)."""

    def __init__(self, o: Onboarded, providers: tuple[Provider, ...] = PROVIDERS):
        self.o = o
        self.providers = providers
        self.benefits = initial_state(o.plan, o.member)
        self._cache: dict[tuple[str, date, str, bool], Visit] = {}

    def visit(self, chosen: Provider, d: date, tooth_state: str, cash: bool) -> Visit:
        key = (chosen.id, d, tooth_state, cash)
        if key not in self._cache:
            self._cache[key] = self._price(chosen, d, tooth_state, cash)
        return self._cache[key]

    def _price(self, chosen: Provider, d: date, tooth_state: str, cash: bool) -> Visit:
        o, benefits = self.o, self.benefits
        start_state = o.procedure.treats_state
        lines: list[Line] = []
        for proc in procedures_for(tooth_state, start_state, o.procedure):
            dentist = provider_for(proc.cdt_code, chosen, o.plan, self.providers)
            r = adjudicate(Claim(proc, dentist, d), benefits, o.plan)
            # Cash where the dentist has a price for this line; insured
            # otherwise.
            path: PaymentPath = "cash" if cash and r.cash is not None else "insured"
            lines.append(
                Line(
                    cdt_code=proc.cdt_code,
                    provider_id=dentist.id,
                    network=r.network,
                    path=path,
                    provider_fee=r.insured.provider_fee,
                    plan_pays=r.insured.plan_pays if path == "insured" else 0,
                    you_pay=r.you_pay(path),
                    denial_reason=r.insured.denial_reason,
                )
            )
            benefits = r.state_after(path)
        return Visit(d, tooth_state, tuple(lines), benefits)


# Options


@dataclass(frozen=True)
class CostStats:
    mean: float
    p5: float
    p95: float
    cvar95: float  # mean of the costliest 5% of futures


def cost_stats(x: NDArray[np.float64]) -> CostStats:
    p5, p95 = np.percentile(x, [5, 95])
    worst = np.sort(x)[-max(1, int(np.ceil(0.05 * len(x)))) :]
    return CostStats(float(x.mean()), float(p5), float(p95), float(worst.mean()))


@dataclass(frozen=True)
class Outcome:
    """One tooth state the futures can reach by the option's date."""

    probability: float
    visit: Visit


@dataclass(frozen=True)
class FsaSummary:
    """Expected FSA use for an option."""

    election: float  # for the option's FSA year; 0 if this year or none
    from_balance: float
    from_election: float
    balance_unused: float
    forfeited: float


@dataclass(frozen=True)
class Option:
    date: date
    path: PaymentPath  # insured, or cash where the dentist has a price
    labels: tuple[str, ...]
    month: int  # simulation month the date falls in
    escalation_probability: float  # chance the tooth is worse by the date
    band: str
    outcomes: tuple[Outcome, ...]  # most likely first
    member_share: CostStats  # what the member owes the dentists
    cost: CostStats  # after FSA and tax: what options are compared on
    fsa: FsaSummary


@dataclass(frozen=True)
class Scored:
    """An option and its after-tax cost in every future. The array stays
    internal: paired comparisons between options need it."""

    option: Option
    costs: NDArray[np.float64]


def payment_paths(o: Onboarded, provider: Provider) -> tuple[PaymentPath, ...]:
    if o.procedure.cdt_code in provider.cash_prices:
        return ("insured", "cash")
    return ("insured",)


def score(
    o: Onboarded,
    sim: SimulationResult,
    provider: Provider,
    candidate: CandidateDate,
    path: PaymentPath,
    pricer: Pricer,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
    use_election: bool = True,
) -> Scored:
    d = candidate.date
    month = months_between(sim.start_date, d)
    states = sim.paths[month]
    reached, which = np.unique(states, return_inverse=True)
    visits = [pricer.visit(provider, d, STATES[s], path == "cash") for s in reached]
    share = np.array([v.you_pay for v in visits], dtype=np.float64)[which]
    funding = fsa.fund(o.member.fsa, d, share, use_election)

    shares = np.bincount(which, minlength=len(reached)) / len(states)
    outcomes = sorted(
        (Outcome(float(p), v) for p, v in zip(shares, visits, strict=True)),
        key=lambda x: -x.probability,
    )
    escalation = float(sim.risk[month])
    option = Option(
        date=d,
        path=path,
        labels=candidate.labels,
        month=month,
        escalation_probability=escalation,
        band=risk_band(escalation, bands),
        outcomes=tuple(outcomes),
        member_share=cost_stats(share),
        cost=cost_stats(funding.cost),
        fsa=FsaSummary(
            election=funding.election,
            from_balance=float(funding.from_balance.mean()),
            from_election=float(funding.from_election.mean()),
            balance_unused=float(funding.balance_unused.mean()),
            forfeited=float(funding.forfeited.mean()),
        ),
    )
    return Scored(option, funding.cost)


def evaluate_options(
    o: Onboarded,
    sim: SimulationResult,
    provider: Provider,
    pricer: Pricer | None = None,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
    use_election: bool = True,
) -> list[Scored]:
    """Every candidate date with every payment path, in date order."""
    if o.procedure.cdt_code not in provider.fees:
        raise ValueError(f"{provider.name} does not offer {o.procedure.cdt_code}")
    if sim.start_date != o.as_of or sim.start_state != o.procedure.treats_state:
        raise ValueError("simulation was run for a different onboarding")
    pricer = pricer or Pricer(o)
    return [
        score(o, sim, provider, c, path, pricer, bands, use_election)
        for c in candidate_dates(o, sim, provider, bands)
        for path in payment_paths(o, provider)
    ]


# Choosing


@dataclass(frozen=True)
class Savings:
    """The baseline's cost minus an option's, paired future by future."""

    mean: float
    p5: float
    p95: float
    # Share of futures where the option costs more than the baseline
    probability_costs_more: float


def savings(baseline: Scored, option: Scored) -> Savings:
    delta = baseline.costs - option.costs
    p5, p95 = np.percentile(delta, [5, 95])
    return Savings(
        float(delta.mean()), float(p5), float(p95), float((delta < 0).mean())
    )


Metric = Callable[[Option], CostStats]


def lowest_cost(
    scored: list[Scored],
    cvar_weight: float = 0.0,
    metric: Metric = lambda option: option.cost,
) -> Scored:
    """Lowest expected cost, plus cvar_weight times the mean of the costliest
    5% of futures. Ties go to the earlier date, then to insured."""

    def key(s: Scored) -> tuple[int, date, bool]:
        c = metric(s.option)
        return (
            round(c.mean + cvar_weight * c.cvar95),
            s.option.date,
            s.option.path == "cash",
        )

    return min(scored, key=key)


def is_baseline(option: Option, as_of: date) -> bool:
    """The earliest date through insurance, with this year's FSA balance:
    what happens without planning."""
    return option.date == as_of and option.path == "insured"


@dataclass(frozen=True)
class Evaluated:
    """One dentist's options, picked on one simulation and reported on
    another.

    Picking the best of many options on one set of futures favors the
    option that got lucky draws, which inflates its savings. Re-scoring on
    independent futures removes that bias.
    """

    select: list[Scored]
    report: dict[tuple[date, PaymentPath], Scored]

    def reported(self, s: Scored) -> Scored:
        return self.report[(s.option.date, s.option.path)]

    def baseline(self, as_of: date) -> Scored:
        return next(
            self.reported(s) for s in self.select if is_baseline(s.option, as_of)
        )


def evaluate(
    o: Onboarded,
    provider: Provider,
    select_sim: SimulationResult,
    report_sim: SimulationResult,
    pricer: Pricer,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
    use_election: bool = True,
) -> Evaluated:
    select = evaluate_options(o, select_sim, provider, pricer, bands, use_election)
    report = {
        (s.option.date, s.option.path): score(
            o,
            report_sim,
            provider,
            CandidateDate(s.option.date, s.option.labels),
            s.option.path,
            pricer,
            bands,
            use_election,
        )
        for s in select
    }
    return Evaluated(select, report)


# What each planning lever contributes to the savings:
#   timing:       dates other than the earliest
#   cash:         paying a dentist's cash price instead of claiming
#   fsa_planning: choosing with the FSA in mind, including next year's
#                 election (without it, this year's balance still pays)
LEVERS = ("timing", "cash", "fsa_planning")


def _choice(
    o: Onboarded,
    full: Evaluated,
    plain: Evaluated,
    levers: frozenset[str],
    allowed: set[str],
    cvar_weight: float,
) -> Scored:
    """The option chosen with only `levers`, re-scored for reporting."""
    planned = "fsa_planning" in levers
    ev = full if planned else plain
    pool = [
        s
        for s in ev.select
        if s.option.band in allowed
        and ("timing" in levers or s.option.date == o.as_of)
        and ("cash" in levers or s.option.path == "insured")
    ]
    metric: Metric = (lambda x: x.cost) if planned else (lambda x: x.member_share)
    return ev.reported(lowest_cost(pool, cvar_weight, metric))


def lever_savings(
    o: Onboarded,
    full: Evaluated,
    plain: Evaluated,
    allowed: set[str],
    cvar_weight: float,
) -> dict[str, float]:
    """Each lever's share of the expected savings, by Shapley value: its
    added saving averaged over every order of turning the levers on.

    The levers interact (an FSA election can make a later date pay off), so
    what a lever adds depends on which others are on. Averaging over orders
    makes the shares add up to the total.
    """
    base = float(full.baseline(o.as_of).costs.mean())
    value: dict[frozenset[str], float] = {}
    for n in range(len(LEVERS) + 1):
        for subset in combinations(LEVERS, n):
            key = frozenset(subset)
            chosen = _choice(o, full, plain, key, allowed, cvar_weight)
            value[key] = base - float(chosen.costs.mean())

    total = len(LEVERS)
    shares: dict[str, float] = {}
    for lever in LEVERS:
        others = [x for x in LEVERS if x != lever]
        share = 0.0
        for n in range(total):
            weight = factorial(n) * factorial(total - n - 1) / factorial(total)
            for subset in combinations(others, n):
                key = frozenset(subset)
                share += weight * (value[key | {lever}] - value[key])
        shares[lever] = share
    return shares


@dataclass(frozen=True)
class ProviderHint:
    """Another dentist whose lowest-cost option within the tolerance costs
    less than the chosen dentist's."""

    provider_id: str
    name: str
    in_network: bool
    distance_miles: float
    option: Option
    savings: Savings  # versus the chosen dentist's lowest-cost option


def provider_hint(
    o: Onboarded,
    chosen: Provider,
    chosen_best: Scored,
    select_sim: SimulationResult,
    report_sim: SimulationResult,
    pricer: Pricer,
    allowed: set[str],
    cvar_weight: float,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
) -> ProviderHint | None:
    """The other dentist with the largest expected saving, nearest first on
    ties; None if no one saves at least HINT_MIN_SAVINGS."""
    found: list[ProviderHint] = []
    for d in pricer.providers:
        if d.id == chosen.id or o.procedure.cdt_code not in d.fees:
            continue
        ev = evaluate(o, d, select_sim, report_sim, pricer, bands)
        within = [s for s in ev.select if s.option.band in allowed]
        best = ev.reported(lowest_cost(within, cvar_weight))
        miles = distance_miles(EXAMPLE_USER_LOCATION, (d.lat, d.lon))
        found.append(
            ProviderHint(
                provider_id=d.id,
                name=d.name,
                in_network=o.plan.id in d.networks,
                distance_miles=round(miles, 1),
                option=best.option,
                savings=savings(chosen_best, best),
            )
        )
    if not found:
        return None
    top = min(found, key=lambda h: (-round(h.savings.mean), h.distance_miles))
    return top if top.savings.mean >= HINT_MIN_SAVINGS else None


@dataclass(frozen=True)
class CarePlan:
    as_of: date
    provider_id: str
    tolerance: str  # highest risk band the member accepts
    # Every option, in date order; numbers come from a fresh simulation
    # (see Evaluated)
    options: tuple[Option, ...]
    lowest_cost: Option  # lowest expected cost within the tolerance
    baseline: Option
    savings: Savings  # baseline minus lowest_cost
    lever_savings: dict[str, float]  # expected savings by lever; sums to total
    # The lowest-cost option overall, if it is cheaper but in a riskier band
    beyond_tolerance: Option | None
    beyond_tolerance_savings: Savings | None  # versus lowest_cost
    provider_hint: ProviderHint | None
    risk: OutcomeSummary
    assumptions: tuple[str, ...]


def choose_plan(
    o: Onboarded,
    provider: Provider,
    select_sim: SimulationResult,
    report_sim: SimulationResult,
    tolerance: str = "low",
    cvar_weight: float = 0.0,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
    providers: tuple[Provider, ...] = PROVIDERS,
) -> CarePlan:
    """Find the lowest-cost option within the tolerance on select_sim, and
    report every number from report_sim."""
    names = [b.name for b in bands]
    if tolerance not in names:
        raise ValueError(f"unknown risk tolerance {tolerance!r}; use one of {names}")
    allowed = set(names[: names.index(tolerance) + 1])

    pricer = Pricer(o, providers)
    full = evaluate(o, provider, select_sim, report_sim, pricer, bands)
    plain = evaluate(o, provider, select_sim, report_sim, pricer, bands, False)
    within = [s for s in full.select if s.option.band in allowed]
    best = lowest_cost(within, cvar_weight)
    overall = lowest_cost(full.select, cvar_weight)

    baseline = full.baseline(o.as_of)
    chosen = full.reported(best)
    beyond = full.reported(overall) if overall is not best else None
    hint = provider_hint(
        o, provider, chosen, select_sim, report_sim, pricer, allowed, cvar_weight, bands
    )
    return CarePlan(
        as_of=o.as_of,
        provider_id=provider.id,
        tolerance=tolerance,
        options=tuple(s.option for s in full.report.values()),
        lowest_cost=chosen.option,
        baseline=baseline.option,
        savings=savings(baseline, chosen),
        lever_savings=lever_savings(o, full, plain, allowed, cvar_weight),
        beyond_tolerance=beyond.option if beyond else None,
        beyond_tolerance_savings=savings(chosen, beyond) if beyond else None,
        provider_hint=hint,
        risk=report_sim.summary,
        assumptions=assumptions(o),
    )


def plan_care(
    o: Onboarded,
    provider: Provider,
    tolerance: str = "low",
    cvar_weight: float = 0.0,
    n_samples: int = N_SAMPLES,
    seed: int = 0,
    bands: tuple[RiskBand, ...] = RISK_BANDS,
) -> CarePlan:
    """Main entry: simulate the tooth twice (selection and reporting, on
    independent seeds) and lay out the options."""
    select_sim = simulate(o, n_samples=n_samples, seed=seed, bands=bands)
    report_sim = simulate(o, n_samples=n_samples, seed=seed + 1, bands=bands)
    return choose_plan(
        o, provider, select_sim, report_sim, tolerance, cvar_weight, bands
    )


def assumptions(o: Onboarded) -> tuple[str, ...]:
    notes = [
        "Only this procedure is modeled; other dental and FSA spending is unknown.",
        "Later plan and FSA years are assumed to have the same rules.",
        "If the tooth gets worse, what it needs is priced as one visit that day.",
        "Progression rates are placeholders, not clinically calibrated.",
    ]
    if o.procedure.category == "major":
        notes.append(
            "Plan payments are estimates; the insurer can confirm them with a "
            "pre-treatment estimate (predetermination)."
        )
    return tuple(notes)
