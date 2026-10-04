"""FSA model: how a flexible spending account pays for one treatment, per
simulated future, and the next-year election with the lowest expected cost.

This year's balance was already taken from paychecks, so spending it costs
nothing more. Whatever is unspent at the deadline is forfeited, apart from
any carryover. A later year's election E costs (1 - tax) * E whether or not
it is spent, and anything beyond it is paid at full price. The election with
the lowest expected cost is the tax-rate quantile of the spending it has to
cover (the newsvendor problem): electing too much loses whole dollars, while
electing too little loses only the tax saving on the gap.

Only the treatment being planned is modeled; the member's other FSA
spending is unknown. Amounts are cents, as in cost.py; arrays hold one
value per simulated future.

Pure logic, no HTTP.
"""

from dataclasses import dataclass
from datetime import date

import numpy as np
from numpy.typing import NDArray

from catalog import Fsa
from cost import Cents, add_months, cents

Amounts = NDArray[np.float64]


@dataclass(frozen=True)
class FsaRules:
    """An Fsa resolved to dates and cents."""

    balance: Cents
    year_end: date
    spend_deadline: date  # year_end, or the end of the grace period
    carryover_limit: Cents
    election_limit: Cents
    tax_rate: float


def rules(fsa: Fsa) -> FsaRules:
    year_end = date.fromisoformat(fsa.year_end)
    grace = fsa.grace_period_end
    return FsaRules(
        balance=cents(fsa.balance),
        year_end=year_end,
        spend_deadline=date.fromisoformat(grace) if grace else year_end,
        carryover_limit=cents(fsa.carryover_limit),
        election_limit=cents(fsa.election_limit),
        tax_rate=fsa.marginal_tax_rate,
    )


def fsa_year(r: FsaRules, d: date) -> int:
    """0 for the current FSA year, 1 for the next, and so on. Later years
    are assumed to be 12 months long."""
    n = 0
    while d > add_months(r.year_end, 12 * n):
        n += 1
    return n


def optimal_election(shortfall: Amounts, r: FsaRules) -> float:
    """The election with the lowest expected after-tax cost for covering
    `shortfall`: its tax-rate quantile, capped at the election limit.

    "inverted_cdf" gives the smallest amount E with P(shortfall <= E) at
    least the tax rate, which is the exact optimum for a sample.
    """
    if len(shortfall) == 0:
        return 0.0
    e = float(np.quantile(shortfall, r.tax_rate, method="inverted_cdf"))
    return float(min(max(round(e), 0), r.election_limit))


@dataclass(frozen=True)
class FsaFunding:
    """How one treatment's member share is paid, in each future."""

    from_balance: Amounts  # this FSA year's balance, including carryover
    from_election: Amounts
    out_of_pocket: Amounts  # paid at full price
    election: float  # elected for the treatment's FSA year; 0 if none
    # This year's balance not spent on the treatment, and the part of it
    # lost at the spending deadline (the rest carries over)
    balance_unused: Amounts
    forfeited: Amounts
    cost: Amounts  # after tax: (1 - tax) * election + out_of_pocket


def fund(
    fsa: Fsa | None, d: date, owed: Amounts, use_election: bool = True
) -> FsaFunding:
    """Pay `owed` (the member's share on date d, one value per future) from
    the FSA where its rules allow. use_election=False leaves a later year's
    election at zero, as a member who does not plan ahead would."""
    owed = np.asarray(owed, dtype=np.float64)
    zeros = np.zeros_like(owed)
    if fsa is None:
        return FsaFunding(zeros, zeros, owed, 0.0, zeros, zeros, owed)

    r = rules(fsa)
    year = fsa_year(r, d)
    if d <= r.spend_deadline:  # this year, or the grace period
        available = r.balance
    elif year == 1:
        available = min(r.balance, r.carryover_limit)
    else:
        available = 0
    from_balance = np.minimum(owed, available)
    shortfall = owed - from_balance

    election = 0.0
    if use_election and year >= 1:
        election = optimal_election(shortfall, r)
    from_election = np.minimum(shortfall, election)
    out_of_pocket = shortfall - from_election

    balance_unused = r.balance - from_balance
    forfeited = np.maximum(balance_unused - r.carryover_limit, 0)
    return FsaFunding(
        from_balance=from_balance,
        from_election=from_election,
        out_of_pocket=out_of_pocket,
        election=election,
        balance_unused=balance_unused,
        forfeited=forfeited,
        cost=(1 - r.tax_rate) * election + out_of_pocket,
    )
