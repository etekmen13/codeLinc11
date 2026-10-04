"""Without AWS (no BEDROCK_MODEL_ID, or Bedrock failing), the CDT mapper
falls back to keywords and term explanations to the reference definition,
so the app runs end to end without credentials."""

import pytest
from botocore.exceptions import NoCredentialsError
from fastapi.testclient import TestClient

import care_plan
import cdt_mapper
import main
from cdt_mapper import keyword_codes

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def no_bedrock(monkeypatch):
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)


@pytest.mark.parametrize(
    ("description", "codes"),
    [
        ("My dentist says I need a root canal on a molar", ["D3330"]),
        ("Two cavities need composite fillings", ["D2391"]),
        ("A crown for a cracked tooth", ["D2740"]),
        ("They want to pull the tooth", ["D7140"]),
        ("Routine cleaning and fluoride varnish", ["D1110", "D1206"]),
        # Implants: the part named, or both parts if neither is
        ("An implant post where the tooth was", ["D6010"]),
        ("A crown on my implant", ["D6065"]),
        ("I need an implant", ["D6010", "D6065"]),
        ("Something about my gums", []),
    ],
)
def test_keyword_codes(description, codes):
    assert keyword_codes(description) == codes


def test_clarification_answers_are_matched_without_the_question():
    # The question names every procedure; only the answer counts.
    description = (
        "Something about my back tooth\n"
        "Question: Which of these treatments is it: cleaning, crown, "
        "root canal (molar)? Answer: the root canal"
    )
    assert keyword_codes(description) == ["D3330"]


def map_cdt(description: str) -> dict:
    res = client.post("/api/cdt/map", json={"treatment_description": description})
    assert res.status_code == 200
    return res.json()


def test_map_without_bedrock_uses_keywords():
    data = map_cdt("My dentist says I need a root canal")
    assert (data["status"], data["matched_by"]) == ("candidate", "keywords")
    assert [c["code"] for c in data["candidate_codes"]] == ["D3330"]


def test_map_without_a_match_asks_which_procedure():
    data = map_cdt("Something about my gums")
    assert data["status"] == "needs_clarification"
    assert data["candidate_codes"] == []
    assert "root canal" in data["clarification_question"]


def test_map_falls_back_when_bedrock_fails(monkeypatch):
    def fail():
        raise NoCredentialsError()

    monkeypatch.setenv("BEDROCK_MODEL_ID", "some-model")
    monkeypatch.setattr(cdt_mapper, "bedrock_client", fail)
    data = map_cdt("A crown for a cracked tooth")
    assert data["matched_by"] == "keywords"
    assert [c["code"] for c in data["candidate_codes"]] == ["D2740"]


def explain(term: str) -> dict:
    res = client.post("/api/care-plan/terms/explain", json={"term": term})
    assert res.status_code == 200
    return res.json()


def test_term_without_bedrock_uses_the_definition():
    text = explain("deductible")["explanation"]
    assert text.startswith(care_plan.DEFINITIONS["deductible"])
    assert text.endswith("Specific rules depend on the plan.")


def test_term_falls_back_when_bedrock_fails(monkeypatch):
    def fail():
        raise NoCredentialsError()

    monkeypatch.setenv("BEDROCK_MODEL_ID", "some-model")
    monkeypatch.setattr(care_plan, "bedrock_client", fail)
    text = explain("premium")["explanation"]
    assert text.startswith(care_plan.DEFINITIONS["premium"])
