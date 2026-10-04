"""The endpoint runs the seeded reporting simulation, so responses are
deterministic and match the care plan endpoints."""

from itertools import pairwise

from fastapi.testclient import TestClient

import main
import quiz
from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE
from handoff import N_SAMPLES
from monte_carlo import HORIZON_MONTHS
from onboarding import OnboardingRequest, validate_onboarding
from progression import STATE_INDEX, STATES
from sequencer import simulations
from simulation_api import N_SAMPLE_PATHS

client = TestClient(main.app)


def body(plan_id="keystone-ppo", code="D3330", **overrides) -> dict:
    state = PROCEDURES_BY_CODE[code].treats_state
    return {
        "plan_id": plan_id,
        "subscriber_id": PLANS_BY_ID[plan_id].plan.subscriber_id_example,
        "procedure_code": code,
        "quiz_answers": {q.id: q.options[0].id for q in quiz.questions_for(state)},
        **overrides,
    }


def test_shapes_and_dates():
    res = client.post("/api/simulation", json=body())
    assert res.status_code == 200
    data = res.json()
    months = HORIZON_MONTHS + 1
    assert (data["as_of"], data["start_state"]) == ("2026-10-01", "root_canal")
    assert data["states"] == list(STATES)
    assert (data["horizon"], data["n_samples"]) == (HORIZON_MONTHS, N_SAMPLES)
    # Month m is as_of plus m months: October 2026 to October 2028.
    dates = data["month_dates"]
    assert (len(dates), dates[0], dates[3], dates[-1]) == (
        months,
        "2026-10-01",
        "2027-01-01",
        "2028-10-01",
    )
    assert len(data["dist"]) == len(data["risk"]) == months
    assert all(abs(sum(row) - 1) < 1e-9 for row in data["dist"])
    assert data["risk"][0] == 0
    assert [b["name"] for b in data["risk_bands"]] == ["low", "medium", "high"]


def test_sample_paths_start_in_the_start_state_and_never_improve():
    paths = client.post("/api/simulation", json=body()).json()["sample_paths"]
    assert len(paths) == N_SAMPLE_PATHS
    assert all(len(p) == HORIZON_MONTHS + 1 for p in paths)
    assert {p[0] for p in paths} == {STATE_INDEX["root_canal"]}
    assert all(a <= b for p in paths for a, b in pairwise(p))


def test_matches_the_care_plan_risk():
    # The reporting simulation, so the bands match the compare and sequence
    # responses for the same request.
    request = body(plan_id="summit-ppo-plus", code="D2740")
    sim = client.post("/api/simulation", json=request).json()
    compare = client.post("/api/care-plan/compare", json=request).json()
    sequence = client.post(
        "/api/care-plan/sequence", json={**request, "provider_id": "uptown-smiles"}
    ).json()
    assert sim["summary"] == compare["risk"] == sequence["risk"]

    o = validate_onboarding(OnboardingRequest(**request))
    assert sim["risk"] == simulations(o)[1].risk.tolist()


def test_invalid_request_lists_every_problem():
    res = client.post(
        "/api/simulation", json=body(subscriber_id="nope", procedure_code="D0000")
    )
    assert res.status_code == 422
    problems = res.json()["detail"]
    assert len(problems) == 2
    assert any("subscriber ID" in p for p in problems)
    assert any("D0000" in p for p in problems)
