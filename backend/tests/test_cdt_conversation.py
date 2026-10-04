import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import cdt_mapper
import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)


def map_text(text, turns=None):
    response = client.post(
        "/api/cdt/map",
        json={"treatment_description": text, "clarifications": turns or []},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(
    "text",
    [
        "My tooth hurts",
        "It is sensitive to cold",
        "I have a cavity",
        "My dentist recommended a crown",
        "They want to pull my tooth",
    ],
)
def test_unclear_descriptions_do_not_select_a_code(text):
    result = map_text(text)
    assert result["status"] == "needs_clarification"
    assert result["candidate_codes"] == []
    assert result["clarification_question"]


def test_structured_answer_refines_root_canal_without_matching_question_words():
    first = map_text("My dentist recommended a root canal")
    result = map_text(
        "My dentist recommended a root canal",
        [{"question": first["clarification_question"], "answer": "A molar"}],
    )
    assert result["status"] == "candidate"
    assert result["candidate_codes"][0]["code"] == "D3330"


@pytest.mark.parametrize(
    "text",
    [
        "Root canal on a front tooth",
        "A metal crown",
        "A surgical extraction",
        "A deep cleaning",
    ],
)
def test_unsupported_distinctions_do_not_use_nearest_priceable_code(text):
    assert map_text(text)["status"] == "no_match"


def test_multiple_treatments_need_a_first_choice():
    first = map_text("Root canal on a molar and a porcelain crown")
    assert first["status"] == "needs_clarification"
    result = map_text(
        "Root canal on a molar and a porcelain crown",
        [{"question": first["clarification_question"], "answer": "D3330"}],
    )
    assert [c["code"] for c in result["candidate_codes"]] == ["D3330"]


def test_negated_treatment_is_not_selected():
    assert (
        map_text("Not a root canal, they mentioned a crown")["status"]
        == "needs_clarification"
    )


def test_explicit_supported_code_and_unknown_code():
    assert map_text("The estimate says D2740")["candidate_codes"][0]["code"] == "D2740"
    assert map_text("The estimate says D9999")["status"] == "no_match"


def test_blank_input_and_excessive_history_are_rejected():
    assert (
        client.post(
            "/api/cdt/map", json={"treatment_description": "       "}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/cdt/map",
            json={
                "treatment_description": "root canal",
                "clarifications": [{"question": "Which tooth?", "answer": "molar"}] * 6,
            },
        ).status_code
        == 422
    )


def mock_model(monkeypatch, result, captured):
    monkeypatch.setenv("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")

    def converse(**kwargs):
        captured.update(kwargs)
        return {"output": {"message": {"content": [{"text": json.dumps(result)}]}}}

    monkeypatch.setattr(
        cdt_mapper, "bedrock_client", lambda: SimpleNamespace(converse=converse)
    )


def test_model_receives_structured_history_and_only_supported_catalog(monkeypatch):
    captured = {}
    mock_model(
        monkeypatch,
        {
            "status": "candidate",
            "candidate_codes": [
                {"code": "D3330", "reason": "Molar root canal in the treatment plan."}
            ],
            "clarification_question": None,
        },
        captured,
    )
    result = map_text(
        "The dentist said root canal", [{"question": "Which tooth?", "answer": "Molar"}]
    )
    assert result["matched_by"] == "model"
    prompt = json.loads(captured["messages"][0]["content"][0]["text"])
    assert prompt["clarifications"][0]["answer"] == "Molar"
    assert {r["code"] for r in prompt["catalog"]} <= {
        p.cdt_code for p in cdt_mapper.PROCEDURES
    }
    assert "D3330" in {r["code"] for r in prompt["catalog"]}


@pytest.mark.parametrize(
    "result",
    [
        {
            "status": "candidate",
            "candidate_codes": [{"code": "D9999", "reason": "Invented"}],
        },
        {"status": "candidate", "candidate_codes": []},
        {
            "status": "needs_clarification",
            "candidate_codes": [{"code": "D3330", "reason": "Guess"}],
            "clarification_question": "Which tooth?",
        },
        {
            "status": "candidate",
            "candidate_codes": [
                {"code": "D3330", "reason": "one"},
                {"code": "D3330", "reason": "two"},
            ],
        },
    ],
)
def test_invalid_model_results_use_conservative_fallback(monkeypatch, result):
    mock_model(monkeypatch, result, {})
    response = map_text("My tooth hurts")
    assert response["matched_by"] == "keywords"
    assert response["status"] == "needs_clarification"
    assert not response["candidate_codes"]


def test_repeated_model_question_uses_fallback(monkeypatch):
    mock_model(
        monkeypatch,
        {
            "status": "needs_clarification",
            "candidate_codes": [],
            "clarification_question": "Which tooth?",
        },
        {},
    )
    result = map_text(
        "Root canal recommended", [{"question": "Which tooth?", "answer": "Molar"}]
    )
    assert result["matched_by"] == "keywords"
    assert result["candidate_codes"][0]["code"] == "D3330"


def test_simple_non_surgical_extraction_can_match():
    result = map_text("A simple non-surgical extraction")
    assert result["status"] == "candidate"
    assert result["candidate_codes"][0]["code"] == "D7140"
