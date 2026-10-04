from datetime import date

from fastapi.testclient import TestClient

import main
import quiz
from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE
from provider import ProvidersOut, find_providers

SUMMIT = PLANS_BY_ID["summit-ppo-plus"]
HARBOR = PLANS_BY_ID["harbor-ppo-basic"]
KEYSTONE = PLANS_BY_ID["keystone-ppo"]
NOV = date(2026, 11, 2)


def ids(column) -> set[str]:
    return {card.id for card in column}


def find(code: str, sample, d: date = NOV, **kwargs) -> ProvidersOut:
    return find_providers(code, sample.plan, sample.default_member, d, **kwargs)


def test_network_column_depends_on_plan():
    # NoDa is in Summit's network but not Harbor's.
    assert "noda-family" in ids(find("D2391", SUMMIT).in_network)
    assert "noda-family" in ids(find("D2391", HARBOR).out_of_network)


def test_skips_dentists_who_do_not_offer_the_procedure():
    result = find("D2391", SUMMIT)
    everyone = ids(result.in_network) | ids(result.out_of_network)
    assert "ballantyne-endo" not in everyone  # specialist, no fillings
    assert "plaza-midwood" in everyone


def test_radius_filter():
    near = find("D3330", SUMMIT, radius_miles=5)
    far = find("D3330", SUMMIT)
    assert "ballantyne-endo" not in ids(near.out_of_network)
    assert "ballantyne-endo" in ids(far.out_of_network)


def test_columns_sorted_by_you_pay():
    result = find("D2740", KEYSTONE)
    for column in (result.in_network, result.out_of_network):
        pays = [card.cost.you_pay for card in column]
        assert pays == sorted(pays)


def test_cost_comes_from_the_engine():
    # Keystone has $400 of maximum left: A = 990, share 495 capped at 400.
    result = find("D2740", KEYSTONE)
    uptown = next(c for c in result.in_network if c.id == "uptown-smiles")
    assert (uptown.cost.plan_pays, uptown.cost.you_pay) == (400, 590)
    assert uptown.cost.annual_maximum_remaining == 0
    assert (uptown.cost.provider_fee, uptown.cost.allowed_amount) == (1250, 990)
    assert uptown.cost.cash_price == 1100
    assert uptown.cost.explanation


def test_past_services_deny_cleaning_until_window_clears():
    # Summit's member had cleanings on 2025-10-15 and 2026-04-14.
    early = find("D1110", SUMMIT, date(2026, 10, 14))
    on_time = find("D1110", SUMMIT, date(2026, 10, 15))
    assert {c.cost.denial_reason for c in early.in_network} == {"frequency_limit"}
    assert all(c.cost.covered for c in on_time.in_network)


def test_date_defaults_to_the_members_as_of():
    result = find_providers("D2391", SUMMIT.plan, SUMMIT.default_member)
    assert result.date_of_service == date.fromisoformat(SUMMIT.default_member.as_of)


client = TestClient(main.app)


def body(**overrides) -> dict:
    procedure = PROCEDURES_BY_CODE["D2740"]
    answers = {
        q.id: q.options[0].id for q in quiz.questions_for(procedure.treats_state)
    }
    return {
        "plan_id": "keystone-ppo",
        "subscriber_id": KEYSTONE.plan.subscriber_id_example,
        "procedure_code": "D2740",
        "quiz_answers": answers,
        "date_of_service": "2026-11-02",
        **overrides,
    }


def test_endpoint_returns_priced_columns():
    res = client.post("/api/providers", json=body())
    assert res.status_code == 200
    data = res.json()
    assert data["procedure"] == "D2740"
    assert data["date_of_service"] == "2026-11-02"
    assert data["in_network"][0]["cost"]["you_pay"] == 590


def test_endpoint_rejects_invalid_onboarding():
    res = client.post("/api/providers", json=body(plan_id="nope"))
    assert res.status_code == 422
    assert any("unknown plan" in p for p in res.json()["detail"])


def test_endpoint_rejects_date_before_member_history():
    # Keystone's member has a filling on 2026-05-06.
    res = client.post("/api/providers", json=body(date_of_service="2026-04-01"))
    assert res.status_code == 422


def test_nearby_providers_are_unpriced_and_nearest_first():
    res = TestClient(main.app).get("/api/providers/nearby?limit=3")
    assert res.status_code == 200
    rows = res.json()
    assert 0 < len(rows) <= 3
    assert set(rows[0]) == {"id", "name", "distance_miles", "credentials"}
    distances = [r["distance_miles"] for r in rows]
    assert distances == sorted(distances)
