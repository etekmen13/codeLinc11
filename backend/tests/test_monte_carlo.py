import numpy as np
import pytest

import quiz
from catalog import PLANS_BY_ID, PROCEDURES
from handoff import build_simulation_input
from monte_carlo import (
    HORIZON_MONTHS,
    BandSegment,
    RiskBand,
    check_bands,
    outcome_summary,
    risk_band,
    run_simulation,
    simulate,
)
from onboarding import OnboardingRequest, validate_onboarding
from progression import STATE_INDEX, STATES

HEALTHY, LESION, CAVITY = (STATE_INDEX[s] for s in STATES[:3])


def onboarded(code: str):
    procedure = next(p for p in PROCEDURES if p.cdt_code == code)
    answers = {
        q.id: q.options[0].id for q in quiz.questions_for(procedure.treats_state)
    }
    plan = PLANS_BY_ID["summit-ppo-plus"].plan
    return validate_onboarding(
        OnboardingRequest(
            plan_id=plan.id,
            subscriber_id=plan.subscriber_id_example,
            procedure_code=code,
            quiz_answers=answers,
        )
    )


def test_run_simulation_validates_inputs():
    x0 = np.array([1.0, 0, 0])
    P = np.broadcast_to(np.eye(3), (4, 3, 3))
    with pytest.raises(ValueError):
        run_simulation(np.array([0.5, 0, 0]), P)  # does not sum to 1
    with pytest.raises(ValueError):
        run_simulation(x0, np.eye(3))  # not k x n x n
    with pytest.raises(ValueError):
        run_simulation(x0, P * 0.5)  # rows do not sum to 1


def test_result_shapes_and_distribution():
    r = simulate(onboarded("D2391"), n_samples=2000)
    assert r.dist.shape == (HORIZON_MONTHS + 1, len(STATES))
    assert r.paths.shape == (HORIZON_MONTHS + 1, 2000)
    assert np.allclose(r.dist.sum(axis=1), 1)
    assert r.risk[0] == 0


@pytest.mark.parametrize("procedure", PROCEDURES, ids=lambda p: p.cdt_code)
def test_starts_where_the_procedure_treats(procedure):
    r = simulate(onboarded(procedure.cdt_code), n_samples=500)
    assert r.start_state == procedure.treats_state
    assert r.dist[0, STATE_INDEX[procedure.treats_state]] == 1


def test_extraction_is_permanent():
    r = simulate(onboarded("D7140"), n_samples=500)
    assert (r.dist[:, STATE_INDEX["extraction"]] == 1).all()
    assert (r.risk == 0).all()


def test_cavity_never_heals_but_early_lesion_can():
    cavity = simulate(onboarded("D2391"), n_samples=2000)
    lesion = simulate(onboarded("D1206"), n_samples=2000)
    assert (cavity.dist[:, [HEALTHY, LESION]] == 0).all()
    assert lesion.dist[-1, HEALTHY] > 0  # remineralization


def test_matches_exact_distribution():
    # Average of x0 @ P_i^t over the per-future matrices, against sampling.
    sim_input = build_simulation_input(onboarded("D2391"), rng=np.random.default_rng(1))
    _, dist, _ = run_simulation(sim_input.start_vector, sim_input.matrices, seed=2)
    x = np.tile(sim_input.start_vector, (len(sim_input.matrices), 1))
    exact = [x.mean(axis=0)]
    for _ in range(HORIZON_MONTHS):
        x = np.einsum("ki,kij->kj", x, sim_input.matrices)
        exact.append(x.mean(axis=0))
    assert np.abs(dist - np.array(exact)).max() < 0.02


def test_same_seed_same_result():
    o = onboarded("D2391")
    a, b, c = simulate(o, seed=7), simulate(o, seed=7), simulate(o, seed=8)
    assert np.array_equal(a.paths, b.paths)
    assert not np.array_equal(a.paths, c.paths)


def test_state_probabilities_by_name():
    r = simulate(onboarded("D2391"), n_samples=500)
    assert r.state_probabilities(0) == {s: float(s == "cavity") for s in STATES}
    with pytest.raises(ValueError):
        r.state_probabilities(r.horizon + 1)


def test_outcome_summary_bands_and_window():
    risk = np.array([0.0, 0.05, 0.12, 0.30, 0.20])
    dist = np.zeros((5, len(STATES)))
    s = outcome_summary(risk, dist)
    assert s.bands == ("low", "low", "medium", "high", "medium")
    assert s.low_risk_until_month == 1
    assert s.band_segments == (
        BandSegment("low", 0, 1),
        BandSegment("medium", 2, 2),
        BandSegment("high", 3, 3),
        BandSegment("medium", 4, 4),
    )
    assert s.band_ranges["medium"] == BandSegment("medium", 2, 4)


def test_outcome_summary_window_is_horizon_when_risk_stays_low():
    s = outcome_summary(np.zeros(4), np.zeros((4, len(STATES))))
    assert s.low_risk_until_month == 3
    assert s.band_ranges["high"] is None


def test_band_limits_are_half_open():
    # Each band covers [previous limit, its limit).
    assert [risk_band(r) for r in (0.0999, 0.10, 0.2499, 0.25, 1.0)] == [
        "low",
        "medium",
        "medium",
        "high",
        "high",
    ]


def test_outcome_summary_takes_any_number_of_bands():
    bands = (
        RiskBand("minimal", 0.05),
        RiskBand("low", 0.10),
        RiskBand("medium", 0.25),
        RiskBand("high", 0.50),
        RiskBand("very_high", None),
    )
    risk = np.array([0.0, 0.07, 0.30, 0.60])
    s = outcome_summary(risk, np.zeros((4, len(STATES))), bands)
    assert s.bands == ("minimal", "low", "high", "very_high")
    assert s.low_risk_until_month == 0
    assert s.band_ranges.keys() == {b.name for b in bands}
    assert s.band_ranges["medium"] is None
    assert s.band_limits == bands


@pytest.mark.parametrize(
    "bands",
    [
        (),
        (RiskBand("low", 0.1),),  # last band must be unbounded
        (RiskBand("low", None), RiskBand("high", None)),
        (RiskBand("low", 0.3), RiskBand("mid", 0.2), RiskBand("high", None)),
        (RiskBand("low", 0.1), RiskBand("low", None)),  # duplicate name
        (RiskBand("low", 1.0), RiskBand("high", None)),
    ],
)
def test_check_bands_rejects_bad_configs(bands):
    with pytest.raises(ValueError):
        check_bands(bands)


def test_simulation_starts_on_the_members_as_of_date():
    o = onboarded("D2391")
    assert simulate(o, n_samples=100).start_date == o.as_of


def test_app_still_has_main():
    from fastapi.testclient import TestClient

    import main

    assert TestClient(main.app).get("/api/onboarding/form").status_code == 200
