from datetime import date

from fastapi.testclient import TestClient

import main
import quiz
from catalog import PLANS_BY_ID, PROCEDURES_BY_CODE
from onboarding import OnboardingRequest, validate_onboarding

KEYSTONE = PLANS_BY_ID["keystone-ppo"]


def request(code: str = "D3330") -> OnboardingRequest:
    procedure = PROCEDURES_BY_CODE[code]
    return OnboardingRequest(
        plan_id=KEYSTONE.plan.id,
        subscriber_id=KEYSTONE.plan.subscriber_id_example,
        procedure_code=code,
        quiz_answers={
            q.id: q.options[0].id for q in quiz.questions_for(procedure.treats_state)
        },
    )


def test_as_of_comes_from_the_sample_member():
    o = validate_onboarding(request())
    assert o.as_of == date.fromisoformat(KEYSTONE.default_member.as_of)


def test_response_carries_as_of_and_fsa():
    res = TestClient(main.app).post("/api/onboarding", json=request().model_dump())
    assert res.status_code == 200
    member = res.json()["member"]
    assert member["as_of"] == KEYSTONE.default_member.as_of
    assert member["fsa"]["balance"] == 400
    assert member["fsa"]["grace_period_end"] is None


def test_quiz_options_carry_risk_direction():
    res = TestClient(main.app).get("/api/quiz?procedure=D3330")
    assert res.status_code == 200
    effects = {
        (q["id"], o["id"]): o["effect"] for q in res.json() for o in q["options"]
    }
    assert effects[("sugar", "rarely")] == "lowers"
    assert effects[("sugar", "daily")] == "neutral"
    assert effects[("sugar", "often")] == "raises"
    assert effects[("brushing", "twice")] == "lowers"
    assert set(effects.values()) <= {"lowers", "raises", "neutral"}


def test_subscriber_id_can_be_omitted_for_all_downstream_endpoints():
    payload = request().model_dump()
    payload.pop("subscriber_id")
    client = TestClient(main.app)
    response = client.post("/api/onboarding", json=payload)
    assert response.status_code == 200
    assert response.json()["member"]["subscriber_id"] == ""
    for endpoint in ("/api/providers", "/api/simulation", "/api/care-plan/compare"):
        assert client.post(endpoint, json=payload).status_code == 200


def test_optional_id_is_not_restricted_to_a_fictional_format():
    payload = request().model_dump()
    payload["subscriber_id"] = "MEMBER123"
    response = TestClient(main.app).post("/api/onboarding", json=payload)
    assert response.status_code == 200
    assert response.json()["member"]["subscriber_id"] == "MEMBER123"


def test_subscriber_id_has_a_length_limit():
    payload = request().model_dump()
    payload["subscriber_id"] = "A" * 101
    assert TestClient(main.app).post("/api/onboarding", json=payload).status_code == 422
