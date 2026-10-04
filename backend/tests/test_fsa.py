"""Amounts are in cents. Sample FSAs: Keystone $400 use-it-or-lose-it,
Summit $300 with a grace period to 2027-03-15, Harbor $250 with a $680
carryover."""

from dataclasses import replace
from datetime import date

import numpy as np
import pytest

from catalog import PLANS_BY_ID
from fsa import fsa_year, fund, optimal_election, rules

KEYSTONE = PLANS_BY_ID["keystone-ppo"].default_member.fsa
SUMMIT = PLANS_BY_ID["summit-ppo-plus"].default_member.fsa
HARBOR = PLANS_BY_ID["harbor-ppo-basic"].default_member.fsa
assert KEYSTONE and SUMMIT and HARBOR

NOV = date(2026, 11, 2)
JAN = date(2027, 1, 4)


def owed(*amounts: float) -> np.ndarray:
    return np.array(amounts, dtype=np.float64)


def test_fsa_year_counts_from_year_end():
    r = rules(KEYSTONE)
    assert [fsa_year(r, d) for d in (NOV, date(2026, 12, 31), JAN)] == [0, 0, 1]
    assert fsa_year(r, date(2028, 1, 1)) == 2


def test_this_years_balance_is_free_to_spend():
    f = fund(KEYSTONE, NOV, owed(54000))
    assert (f.from_balance[0], f.out_of_pocket[0], f.cost[0]) == (40000, 14000, 14000)
    assert f.election == 0 and f.forfeited[0] == 0


def test_unspent_balance_is_forfeited_without_carryover():
    f = fund(KEYSTONE, NOV, owed(10000))
    assert (f.balance_unused[0], f.forfeited[0], f.cost[0]) == (30000, 30000, 0)


def test_carryover_keeps_unspent_balance():
    # Harbor: $135 spent, $115 left, all of it under the $680 carryover.
    f = fund(HARBOR, NOV, owed(13500))
    assert (f.balance_unused[0], f.forfeited[0]) == (11500, 0)


def test_carryover_pays_next_year_then_election_covers_the_rest():
    # $820 in January: $250 carried over, $570 elected at 22% tax.
    f = fund(HARBOR, JAN, owed(82000))
    assert (f.from_balance[0], f.election, f.out_of_pocket[0]) == (25000, 57000, 0)
    assert f.cost[0] == pytest.approx(0.78 * 57000)


def test_grace_period_spends_this_years_balance_next_year():
    # Summit in February: $300 from the old balance, $245 elected at 30%.
    f = fund(SUMMIT, date(2027, 2, 1), owed(54500))
    assert (f.from_balance[0], f.election) == (30000, 24500)
    assert f.cost[0] == pytest.approx(0.7 * 24500)


def test_after_the_deadline_the_old_balance_is_gone():
    f = fund(KEYSTONE, JAN, owed(52000))
    assert (f.from_balance[0], f.forfeited[0], f.election) == (0, 40000, 52000)


def test_election_is_the_tax_rate_quantile():
    r = rules(KEYSTONE)  # 30%
    mostly_zero = owed(*[0] * 70, *[100000] * 30)
    mostly_high = owed(*[0] * 20, *[100000] * 80)
    assert optimal_election(mostly_zero, r) == 0
    assert optimal_election(mostly_high, r) == 100000


def test_election_minimizes_expected_cost():
    r = rules(KEYSTONE)
    shortfall = np.random.default_rng(0).gamma(2.0, 30000, 2000)
    best = optimal_election(shortfall, r)

    def expected(e: float) -> float:
        return (1 - r.tax_rate) * e + np.maximum(shortfall - e, 0).mean()

    grid = np.linspace(0, shortfall.max(), 400)
    assert expected(best) <= min(expected(e) for e in grid) + 1


def test_election_capped_at_the_limit():
    r = rules(replace(KEYSTONE, election_limit=500))
    assert optimal_election(owed(100000, 100000), r) == 50000


def test_without_election_next_year_is_full_price():
    f = fund(KEYSTONE, JAN, owed(52000), use_election=False)
    assert (f.election, f.cost[0]) == (0, 52000)


def test_no_fsa_means_full_price():
    f = fund(None, NOV, owed(54000, 0))
    assert list(f.cost) == [54000, 0]
    assert not f.from_balance.any()
