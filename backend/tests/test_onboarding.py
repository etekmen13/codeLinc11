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


def test_response_carries_as_of():
    res = TestClient(main.app).post("/api/onboarding", json=request().model_dump())
    assert res.status_code == 200
    member = res.json()["member"]
    assert member["as_of"] == KEYSTONE.default_member.as_of
