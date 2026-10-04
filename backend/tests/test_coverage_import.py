from fastapi.testclient import TestClient
from test_onboarding import request

import main
from cost import initial_state
from coverage_import import extract_pages
from onboarding import CoverageInput, MemberInput, validate_onboarding


def test_overview_never_invents_exact_benefits():
    result = extract_pages(
        [
            "Lincoln Financial\nProduct highlights and features\nCalendar-year maximum $500–$5,000\nDeductible $0–$200"
        ]
    )
    assert result["document_type"] == "product_overview"
    assert set(result["fields"]) == {"insurer"}


def test_exact_fields_include_page_evidence_and_conflicts_are_omitted():
    result = extract_pages(
        [
            "Annual maximum: $1,500\nIndividual deductible: $50\nPreventive: 100%\nBasic: 80%\nMajor: 50%",
            "Major: 60%",
        ]
    )
    assert result["fields"]["annual_maximum"]["value"] == 1500
    assert result["fields"]["basic"]["value"] == 0.8
    assert result["fields"]["deductible"]["page"] == 1
    assert "major" not in result["fields"]
    assert result["requires_confirmation"]


def test_ranges_are_not_imported():
    assert not extract_pages(["Annual maximum $500-$5,000\nDeductible $0 to $200"])[
        "fields"
    ]


def test_confirmed_balances_flow_to_cost_state_and_response():
    req = request()
    req.coverage = CoverageInput(
        annual_maximum=2000,
        deductible=50,
        preventive=1,
        basic=0.8,
        major=0.5,
        plan_year_start="2026-01-01",
    )
    req.member = MemberInput(
        as_of="2026-10-04",
        coverage_start="2025-01-01",
        amount_used=1000,
        deductible_met=25,
    )
    onboarded = validate_onboarding(req)
    state = initial_state(onboarded.plan, onboarded.member)
    assert state.max_remaining == 100000
    assert state.deductible_remaining == 2500
    client = TestClient(main.app)
    response = client.post("/api/onboarding", json=req.model_dump(mode="json"))
    assert response.status_code == 200
    assert response.json()["member"]["amount_used"] == 1000
    assert response.json()["plan"]["annual_maximum"] == 2000
    assert (
        client.post("/api/simulation", json=req.model_dump(mode="json")).status_code
        == 200
    )
    assert (
        client.post("/api/providers", json=req.model_dump(mode="json")).status_code
        == 200
    )


def test_invalid_balances_are_rejected():
    payload = request().model_dump()
    payload["member"] = dict(  # noqa: C408
        as_of="2026-10-04",
        coverage_start="2025-01-01",
        amount_used=9999,
        deductible_met=0,
    )
    assert TestClient(main.app).post("/api/onboarding", json=payload).status_code == 422


def test_invalid_upload_and_text_pdf():
    client = TestClient(main.app)
    assert (
        client.post(
            "/api/coverage/extract",
            files={"file": ("bad.pdf", b"not a pdf", "application/pdf")},
        ).status_code
        == 422
    )
    # A generated text-based policy exercises the full upload/extraction path.
    stream = b"BT /F1 12 Tf 30 700 Td (Annual maximum: $1,500) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(stream)).encode()
        + b" >>\nstream\n"
        + stream
        + b"\nendstream",
    ]
    data = b"%PDF-1.4\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(data)
    data += b"xref\n0 6\n0000000000 65535 f \n"
    data += b"".join(f"{offset:010} 00000 n \n".encode() for offset in offsets[1:])
    data += f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    response = client.post(
        "/api/coverage/extract", files={"file": ("policy.pdf", data, "application/pdf")}
    )
    assert response.status_code == 200
    assert response.json()["fields"]["annual_maximum"]["value"] == 1500
