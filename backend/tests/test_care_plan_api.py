"""The endpoint runs the seeded simulations, so responses are deterministic.
Amounts are in dollars."""

from fastapi.testclient import TestClient

import main
import quiz
from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE

client = TestClient(main.app)


def body(plan_id="keystone-ppo", code="D3330", **overrides) -> dict:
    state = PROCEDURES_BY_CODE[code].treats_state
    return {
        "plan_id": plan_id,
        "subscriber_id": PLANS_BY_ID[plan_id].plan.subscriber_id_example,
        "procedure_code": code,
        "quiz_answers": {q.id: q.options[0].id for q in quiz.questions_for(state)},
        "provider_id": "uptown-smiles",
        **overrides,
    }


def post(**kwargs):
    return client.post("/api/care-plan/sequence", json=body(**kwargs))


def test_keystone_root_canal_in_dollars():
    # A = 940, plan pays the last $400 of the maximum, you owe 540, and the
    # $400 FSA balance brings the cost to 140 (see test_sequencer).
    res = post()
    assert res.status_code == 200
    data = res.json()
    chosen = data["lowest_cost"]
    assert (data["as_of"], chosen["date"], chosen["path"]) == (
        "2026-10-01",
        "2026-10-01",
        "insured",
    )
    assert (chosen["member_share"]["mean"], chosen["cost"]["mean"]) == (540.0, 140.0)
    (outcome,) = chosen["outcomes"]
    (line,) = outcome["visit"]["lines"]
    assert (line["procedure_name"], line["provider_name"]) == (
        "Root canal (molar)",
        "Uptown Smiles",
    )
    assert (line["provider_fee"], line["plan_pays"], line["you_pay"]) == (
        1150.0,
        400.0,
        540.0,
    )
    assert data["maximum"][0]["remaining"] == 0.0
    assert data["fsa"]["spent"] == 400.0
    assert [b["name"] for b in data["risk_bands"]] == ["low", "medium", "high"]
    assert data["tail_weight"] == 0.1
    assert data["assumptions"]


def test_options_cover_every_candidate_date_and_path():
    data = post().json()
    keys = [(x["date"], x["path"]) for x in data["options"]]
    dates = [d for d, _ in keys]
    assert dates == sorted(dates) and len(keys) == len(set(keys))
    assert {x["path"] for x in data["options"]} == {"insured", "cash"}


def test_tail_weight_and_tolerance_change_the_pick():
    # Harbor root canal: at low risk, January saves about $8 on average over
    # today, but the default tail weight counts its costly bad case against
    # it. At medium risk, July (after the waiting period) saves enough to win
    # either way.
    weighted = post(plan_id="harbor-ppo-basic").json()
    plain = post(plan_id="harbor-ppo-basic", tail_weight=0).json()
    medium = post(plan_id="harbor-ppo-basic", risk_tolerance="medium").json()
    assert weighted["lowest_cost"]["date"] == "2026-10-01"
    assert plain["lowest_cost"]["date"] == "2027-01-04"
    assert medium["lowest_cost"]["date"] == "2027-07-01"  # waiting period ends
    assert medium["lowest_cost"]["band"] == "medium"


def test_reminders():
    # Summit crown at Plaza Midwood: the unused maximum and a covered cleaning
    # are reminders.
    data = post(plan_id="summit-ppo-plus", code="D2740", provider_id="plaza-midwood")
    data = data.json()
    kinds = [r["kind"] for r in data["reminders"]]
    assert "annual_maximum_expires" in kinds and "cleaning_covered" in kinds


def test_every_problem_reported_at_once():
    bad = body(plan_id="keystone-ppo") | {
        "plan_id": "nope",
        "provider_id": "nobody",
        "risk_tolerance": "reckless",
    }
    res = client.post("/api/care-plan/sequence", json=bad)
    assert res.status_code == 422
    problems = " ".join(res.json()["detail"])
    assert "unknown plan" in problems
    assert "unknown provider" in problems
    assert "unknown risk tolerance" in problems


def test_dentist_must_offer_the_procedure():
    res = post(provider_id="noda-family")  # refers root canals out
    assert res.status_code == 422
    assert "does not offer" in res.json()["detail"][0]


def test_negative_tail_weight_rejected():
    assert post(tail_weight=-1).status_code == 422


def compare(**kwargs):
    b = body(**kwargs)
    del b["provider_id"]
    return client.post("/api/care-plan/compare", json=b)


def test_compare_columns():
    res = compare(plan_id="summit-ppo-plus", code="D2740")
    assert res.status_code == 200
    data = res.json()
    assert data["procedure"] == "D2740"
    assert all(d["in_network"] for d in data["in_network"])
    assert not any(d["in_network"] for d in data["out_of_network"])
    for column in (data["in_network"], data["out_of_network"]):
        costs = [d["lowest_cost"]["cost"]["mean"] for d in column]
        assert costs == sorted(costs)
    # In-network dentists are cheaper on their best schedules here.
    assert (
        data["in_network"][0]["lowest_cost"]["cost"]["mean"]
        < data["out_of_network"][0]["lowest_cost"]["cost"]["mean"]
    )


def test_compare_card_matches_the_sequence_endpoint():
    cards = compare(plan_id="summit-ppo-plus", code="D2740").json()
    plaza = next(
        d for d in cards["out_of_network"] if d["provider_id"] == "plaza-midwood"
    )
    plan = post(plan_id="summit-ppo-plus", code="D2740", provider_id="plaza-midwood")
    plan = plan.json()
    assert plaza["lowest_cost"] == plan["lowest_cost"]
    assert plaza["baseline"] == plan["baseline"]
    assert plaza["savings"] == plan["savings"]


def test_compare_radius_and_validation():
    near = compare(plan_id="summit-ppo-plus", code="D2740", radius_miles=5).json()
    assert [d["provider_id"] for d in near["in_network"]] == ["uptown-smiles"]
    assert compare(radius_miles=0).status_code == 422
    res = compare(risk_tolerance="reckless")
    assert res.status_code == 422
    assert "unknown risk tolerance" in res.json()["detail"][0]
