"""Expected numbers are worked by hand from the catalog. Amounts are in
cents. Most tests use a hand-built simulation so outcomes are exact."""

from datetime import date

import numpy as np
import pytest

import quiz
from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE, PROVIDERS_BY_ID
from monte_carlo import HORIZON_MONTHS, SimulationResult, outcome_summary
from onboarding import Onboarded, OnboardingRequest, validate_onboarding
from progression import STATE_INDEX, STATES
from sequencer import (
    Pricer,
    candidate_dates,
    evaluate_options,
    frequency_limit_clears,
    months_between,
    procedures_for,
    provider_for,
)

UPTOWN = PROVIDERS_BY_ID["uptown-smiles"]  # in network everywhere, has cash prices
SOUTHPARK = PROVIDERS_BY_ID["southpark-dental"]  # in network, no cash prices
NODA = PROVIDERS_BY_ID["noda-family"]  # refers root canals out


def onboarded(plan_id: str, code: str) -> Onboarded:
    plan = PLANS_BY_ID[plan_id].plan
    state = PROCEDURES_BY_CODE[code].treats_state
    return validate_onboarding(
        OnboardingRequest(
            plan_id=plan_id,
            subscriber_id=plan.subscriber_id_example,
            procedure_code=code,
            quiz_answers={q.id: q.options[0].id for q in quiz.questions_for(state)},
        )
    )


def fake_sim(
    o: Onboarded, worse: str | None = None, share: float = 0.1, from_month: int = 3
) -> SimulationResult:
    """100 futures that stay put, except `share` of them move to `worse`
    from `from_month` on."""
    k = 100
    paths = np.full((HORIZON_MONTHS + 1, k), STATE_INDEX[o.procedure.treats_state])
    if worse is not None:
        paths[from_month:, : round(share * k)] = STATE_INDEX[worse]
    dist = np.stack([np.bincount(row, minlength=len(STATES)) for row in paths]) / k
    risk = (paths > paths[0]).mean(axis=1)
    return SimulationResult(
        start_state=o.procedure.treats_state,
        start_date=o.as_of,
        dist=dist,
        risk=risk,
        paths=paths,
        summary=outcome_summary(risk, dist),
    )


def by_date(scored, d: date, path: str = "insured"):
    return next(s for s in scored if s.option.date == d and s.option.path == path)


def test_months_between():
    start = date(2026, 10, 1)
    assert months_between(start, start) == 0
    assert months_between(start, date(2026, 12, 31)) == 2
    assert months_between(start, date(2027, 1, 1)) == 3
    assert months_between(date(2026, 1, 31), date(2026, 2, 28)) == 1


def test_candidate_dates_follow_resets_fsa_and_risk():
    o = onboarded("keystone-ppo", "D3330")
    dates = {
        c.date: c.labels for c in candidate_dates(o, fake_sim(o, "extraction"), UPTOWN)
    }
    assert dates == {
        date(2026, 10, 1): ("earliest",),
        date(2026, 12, 1): ("last_month_low_risk",),  # risk reaches 10% in month 3
        date(2026, 12, 18): ("before_plan_reset",),
        date(2026, 12, 31): ("fsa_deadline",),
        date(2027, 1, 4): ("after_plan_reset",),
        date(2027, 12, 18): ("before_plan_reset",),
        date(2028, 1, 4): ("after_plan_reset",),
        date(2028, 10, 1): ("last_month_medium_risk",),  # never reaches 25%
    }


def test_candidate_dates_include_waiting_period_end():
    # Harbor's member started 2026-07-01; major work waits 12 months.
    o = onboarded("harbor-ppo-basic", "D3330")
    dates = {c.date: c.labels for c in candidate_dates(o, fake_sim(o), UPTOWN)}
    assert dates[date(2027, 7, 1)] == ("waiting_period_ends",)


def test_frequency_limit_clears_when_the_oldest_cleaning_ages_out():
    # Summit's member had cleanings on 2025-10-15 and 2026-04-14.
    assert frequency_limit_clears(onboarded("summit-ppo-plus", "D1110"), UPTOWN) == (
        date(2026, 10, 15)
    )
    assert frequency_limit_clears(onboarded("summit-ppo-plus", "D2391"), UPTOWN) is None


def test_earliest_root_canal_uses_this_years_fsa():
    # Keystone: A = 940, share 470 capped at the 400 left, you owe 540.
    # The $400 FSA balance pays the rest down to 140.
    o = onboarded("keystone-ppo", "D3330")
    option = by_date(evaluate_options(o, fake_sim(o), UPTOWN), o.as_of).option
    assert option.member_share.mean == 54000
    assert option.cost.mean == 14000
    assert option.fsa.from_balance == 40000 and option.fsa.forfeited == 0
    assert [x.probability for x in option.outcomes] == [1.0]


def test_after_reset_prices_each_state_and_elects_next_years_fsa():
    # January, fresh year: root canal d = 100, plan 50% of 840 = 420, you 520.
    # Extraction bundle: D7140 A = 170, d = 100, plan 80% of 70 = 56, you 114;
    # D6010 plan 850, you 850; D6065 plan 600 capped at 594, you 606.
    # Election: 30% quantile of {520 x 90, 1570 x 10} = 520.
    # Cost = 0.7 * 520 + 10% * (1570 - 520) = 364 + 105 = 469.
    o = onboarded("keystone-ppo", "D3330")
    scored = evaluate_options(o, fake_sim(o, "extraction"), UPTOWN)
    option = by_date(scored, date(2027, 1, 4)).option
    kept, lost = option.outcomes
    assert (kept.probability, kept.visit.you_pay) == (0.9, 52000)
    assert (lost.probability, lost.visit.you_pay) == (pytest.approx(0.1), 157000)
    assert [line.cdt_code for line in lost.visit.lines] == ["D7140", "D6010", "D6065"]
    assert option.fsa.election == 52000
    assert option.cost.mean == pytest.approx(46900)
    assert (option.escalation_probability, option.band) == (
        pytest.approx(0.1),
        "medium",
    )


def test_cash_options_only_where_the_dentist_has_a_price():
    o = onboarded("keystone-ppo", "D3330")
    sim = fake_sim(o)
    assert {s.option.path for s in evaluate_options(o, sim, UPTOWN)} == {
        "insured",
        "cash",
    }
    assert {s.option.path for s in evaluate_options(o, sim, SOUTHPARK)} == {"insured"}


def test_cash_leaves_benefits_untouched():
    o = onboarded("keystone-ppo", "D3330")
    option = by_date(evaluate_options(o, fake_sim(o), UPTOWN), o.as_of, "cash").option
    (outcome,) = option.outcomes
    assert outcome.visit.you_pay == 100000  # Uptown's cash price
    assert outcome.visit.benefits_after == Pricer(o).benefits


def test_referral_for_work_the_chosen_dentist_does_not_do():
    plan = PLANS_BY_ID["keystone-ppo"].plan
    assert provider_for("D2391", NODA, plan) is NODA
    # In network with Keystone and offering root canals: Uptown ($1,150) and
    # SouthPark ($1,300).
    assert provider_for("D3330", NODA, plan) is UPTOWN


def test_routine_visit_still_billed_when_a_problem_is_found():
    cleaning = PROCEDURES_BY_CODE["D1110"]
    found = procedures_for("cavity", "healthy", cleaning)
    assert [p.cdt_code for p in found] == ["D1110", "D2391"]
    filling = PROCEDURES_BY_CODE["D2391"]
    assert [p.cdt_code for p in procedures_for("root_canal", "cavity", filling)] == [
        "D3330",
        "D2740",
    ]


def test_provider_must_offer_the_procedure():
    o = onboarded("keystone-ppo", "D3330")
    with pytest.raises(ValueError):
        evaluate_options(o, fake_sim(o), NODA)
