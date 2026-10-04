"""Expected numbers are worked by hand from the catalog, so each test also
checks the pipeline arithmetic. Amounts are in cents."""

from dataclasses import replace
from datetime import date

import pytest

from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE, PROVIDERS_BY_ID, Provider
from cost import (
    BenefitState,
    Claim,
    ServiceRecord,
    adjudicate,
    adjudicate_sequence,
    cents,
    initial_state,
)

SUMMIT = PLANS_BY_ID["summit-ppo-plus"]
HARBOR = PLANS_BY_ID["harbor-ppo-basic"]
KEYSTONE = PLANS_BY_ID["keystone-ppo"]
UPTOWN = PROVIDERS_BY_ID["uptown-smiles"]  # in network everywhere, has cash prices
SOUTHPARK = PROVIDERS_BY_ID["southpark-dental"]  # in network, no cash prices
DILWORTH = PROVIDERS_BY_ID["dilworth-dental"]  # out of network


def state(**overrides) -> BenefitState:
    base = BenefitState(
        plan_year_start=date(2026, 1, 1),
        deductible_remaining=cents(50),
        max_remaining=cents(2000),
        coverage_start=date(2025, 1, 1),
        history=(ServiceRecord("D1110", date(2026, 3, 10)),),
    )
    return replace(base, **overrides)


def claim(code: str, provider: Provider, d: date) -> Claim:
    return Claim(PROCEDURES_BY_CODE[code], provider, d)


def test_in_network_filling_deductible_then_coinsurance():
    # A = 150, d = 50, plan = 80% of 100 = 80, you = 150 - 80 = 70
    r = adjudicate(claim("D2391", UPTOWN, date(2026, 11, 2)), state(), SUMMIT.plan)
    ins = r.insured
    assert r.network == "in"
    assert (ins.allowed_amount, ins.deductible_applied) == (cents(150), cents(50))
    assert (ins.plan_pays, ins.you_pay, ins.balance_billing) == (
        cents(80),
        cents(70),
        0,
    )
    assert ins.new_state.deductible_remaining == 0
    assert ins.new_state.max_remaining == cents(1920)


def test_preventive_skips_deductible():
    r = adjudicate(claim("D1110", UPTOWN, date(2026, 9, 15)), state(), SUMMIT.plan)
    assert (r.insured.plan_pays, r.insured.you_pay) == (cents(85), 0)
    assert r.insured.new_state.deductible_remaining == cents(50)


def test_out_of_network_balance_bill():
    # F = 210, A = 160, d = 50, plan = 80% of 110 = 88, balance = 50,
    # you = (160 - 88) + 50 = 122
    r = adjudicate(claim("D2391", DILWORTH, date(2026, 11, 2)), state(), SUMMIT.plan)
    ins = r.insured
    assert r.network == "out"
    assert (ins.allowed_amount, ins.plan_pays) == (cents(160), cents(88))
    assert (ins.balance_billing, ins.you_pay) == (cents(50), cents(122))


def test_allowed_amount_capped_at_billed_fee():
    cheap = replace(UPTOWN, fees={**UPTOWN.fees, "D2391": 120})
    r = adjudicate(claim("D2391", cheap, date(2026, 11, 2)), state(), SUMMIT.plan)
    assert r.insured.allowed_amount == cents(120)


def test_annual_max_caps_plan_share():
    # A = 950, d = 50, share = 50% of 900 = 450, capped at 200, you = 750
    s = state(max_remaining=cents(200))
    r = adjudicate(claim("D2740", UPTOWN, date(2026, 11, 2)), s, SUMMIT.plan)
    assert (r.insured.plan_pays, r.insured.you_pay) == (cents(200), cents(750))
    assert r.insured.new_state.max_remaining == 0
    assert r.benefit_consumed == cents(200)


def test_deductible_larger_than_fee_does_not_go_negative():
    s = state(deductible_remaining=cents(200))
    r = adjudicate(claim("D2391", UPTOWN, date(2026, 11, 2)), s, SUMMIT.plan)
    assert (r.insured.deductible_applied, r.insured.plan_pays) == (cents(150), 0)
    assert r.insured.new_state.deductible_remaining == cents(50)


def test_frequency_limit_denies_third_cleaning():
    s = state(
        history=(
            ServiceRecord("D1110", date(2026, 3, 10)),
            ServiceRecord("D1110", date(2026, 9, 10)),
        )
    )
    r = adjudicate(claim("D1110", UPTOWN, date(2026, 11, 2)), s, SUMMIT.plan)
    assert r.insured.denial_reason == "frequency_limit"
    # Denied in network: the member owes the negotiated fee, not the billed fee.
    assert (r.insured.plan_pays, r.insured.you_pay) == (0, cents(85))
    assert r.insured.new_state == s


def test_frequency_window_excludes_service_exactly_n_months_earlier():
    s = state(
        history=(
            ServiceRecord("D1110", date(2025, 11, 2)),
            ServiceRecord("D1110", date(2026, 3, 10)),
        )
    )
    day_before = adjudicate(claim("D1110", UPTOWN, date(2026, 11, 1)), s, SUMMIT.plan)
    on_day = adjudicate(claim("D1110", UPTOWN, date(2026, 11, 2)), s, SUMMIT.plan)
    assert day_before.insured.denial_reason == "frequency_limit"
    assert on_day.insured.eligible


def test_waiting_period_denies_major_for_new_member():
    # Harbor's default member started 2026-07-01; major waits 12 months.
    s = initial_state(HARBOR.plan, HARBOR.default_member)
    in_net = adjudicate(claim("D2740", UPTOWN, date(2026, 11, 2)), s, HARBOR.plan)
    out_net = adjudicate(claim("D2740", DILWORTH, date(2026, 11, 2)), s, HARBOR.plan)
    assert in_net.insured.denial_reason == "waiting_period"
    assert in_net.insured.you_pay == cents(870)  # negotiated fee
    assert out_net.insured.you_pay == cents(1350)  # full billed fee


def test_waiting_period_ends_in_next_plan_year():
    # Rolls to 2027: d = 75, plan = 50% of 795 = 397.50, you = 472.50
    s = initial_state(HARBOR.plan, HARBOR.default_member)
    r = adjudicate(claim("D2740", UPTOWN, date(2027, 7, 1)), s, HARBOR.plan)
    assert r.insured.eligible
    assert (r.insured.plan_pays, r.insured.you_pay) == (39750, 47250)


def test_plan_year_rollover_resets_benefits_and_reports_assumption():
    s = state(deductible_remaining=0, max_remaining=cents(10))
    r = adjudicate(claim("D2391", UPTOWN, date(2027, 1, 15)), s, SUMMIT.plan)
    assert r.insured.plan_pays == cents(80)
    assert r.insured.new_state.plan_year_start == date(2027, 1, 1)
    assert r.assumptions


def test_initial_state_from_catalog_member():
    s = initial_state(KEYSTONE.plan, KEYSTONE.default_member)
    assert (s.deductible_remaining, s.max_remaining) == (0, cents(400))
    assert s.plan_year_start == date(2026, 1, 1)


def test_past_services_count_toward_frequency_limits():
    # Summit's member had cleanings on 2025-10-15 and 2026-04-14 (2 per 12
    # months), so the next is covered once the first ages out on 2026-10-15.
    s = initial_state(SUMMIT.plan, SUMMIT.default_member)
    assert len(s.history) == 2
    early = adjudicate(claim("D1110", UPTOWN, date(2026, 10, 14)), s, SUMMIT.plan)
    on_time = adjudicate(claim("D1110", UPTOWN, date(2026, 10, 15)), s, SUMMIT.plan)
    assert early.insured.denial_reason == "frequency_limit"
    assert on_time.insured.eligible


def test_splitting_across_reset_saves_when_maximum_is_nearly_used():
    # Now: A = 990, d = 0, share 495 capped at 400, you = 590.
    # January: fresh year, d = 100, plan = 50% of 890 = 445, you = 545.
    s = initial_state(KEYSTONE.plan, KEYSTONE.default_member)
    now = adjudicate(claim("D2740", UPTOWN, date(2026, 11, 2)), s, KEYSTONE.plan)
    later = adjudicate(claim("D2740", UPTOWN, date(2027, 1, 4)), s, KEYSTONE.plan)
    assert (now.insured.you_pay, later.insured.you_pay) == (cents(590), cents(545))


def test_cash_path_leaves_state_unchanged():
    s = state()
    results, final = adjudicate_sequence(
        [claim("D2391", UPTOWN, date(2026, 11, 2))], s, SUMMIT.plan, ["cash"]
    )
    assert results[0].you_pay("cash") == cents(160)
    assert final == s


def test_no_cash_price_means_no_cash_path():
    r = adjudicate(claim("D2391", SOUTHPARK, date(2026, 11, 2)), state(), SUMMIT.plan)
    assert r.cash is None
    assert r.lowest_you_pay == r.insured.you_pay
    with pytest.raises(ValueError):
        r.you_pay("cash")


def test_sequence_threads_state_root_canal_then_crown():
    # RCT: A = 900, d = 50, plan = 50% of 850 = 425, you = 475, max left 1575
    # Crown: A = 950, d = 0, plan = 475, you = 475, max left 1100
    claims = [
        claim("D3330", UPTOWN, date(2026, 11, 2)),
        claim("D2740", UPTOWN, date(2026, 11, 16)),
    ]
    results, final = adjudicate_sequence(claims, state(), SUMMIT.plan)
    assert [r.insured.plan_pays for r in results] == [cents(425), cents(475)]
    assert [r.insured.you_pay for r in results] == [cents(475), cents(475)]
    assert final.max_remaining == cents(1100)


def test_losing_a_tooth_costs_more_than_saving_it():
    # Save: RCT + crown, you pay 475 + 475 = 950 (see the test above).
    # Lose: extraction A = 165, d = 50, plan = 80% of 115 = 92, you = 73;
    # implant post A = 1650, plan = 825, you = 825;
    # implant crown A = 1150, plan = 575, you = 575. Total 1473.
    save = [
        claim("D3330", UPTOWN, date(2026, 11, 2)),
        claim("D2740", UPTOWN, date(2026, 11, 16)),
    ]
    lose = [
        claim("D7140", UPTOWN, date(2026, 11, 2)),
        claim("D6010", UPTOWN, date(2026, 11, 16)),
        claim("D6065", UPTOWN, date(2026, 12, 14)),
    ]
    saved, _ = adjudicate_sequence(save, state(), SUMMIT.plan)
    lost, final = adjudicate_sequence(lose, state(), SUMMIT.plan)
    assert [r.insured.you_pay for r in lost] == [cents(73), cents(825), cents(575)]
    assert sum(r.insured.you_pay for r in lost) > sum(r.insured.you_pay for r in saved)
    assert final.max_remaining == cents(508)


def test_procedure_not_offered_raises():
    noda = PROVIDERS_BY_ID["noda-family"]  # refers root canals out
    with pytest.raises(ValueError):
        adjudicate(claim("D3330", noda, date(2026, 11, 2)), state(), SUMMIT.plan)


def test_out_of_order_claim_raises():
    with pytest.raises(ValueError):
        adjudicate(claim("D2391", UPTOWN, date(2026, 2, 1)), state(), SUMMIT.plan)
