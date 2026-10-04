"""Conservative, evidence-backed extraction. No uploaded documents are retained."""

import io
import re

import pdfplumber
from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter(prefix="/api/coverage", tags=["coverage"])
MAX_BYTES = 10 * 1024 * 1024


def extract_pages(pages: list[str]) -> dict:
    fields = {}
    combined = "\n".join(pages)
    overview = bool(
        re.search(
            r"product highlights|wide variety of flexible plans",
            combined,
            re.IGNORECASE,
        )
    )
    for number, text in enumerate(pages, 1):
        for name, pattern in (
            ("Lincoln Financial", r"Lincoln Financial"),
            ("Delta Dental", r"Delta Dental"),
            ("MetLife", r"MetLife"),
        ):
            match = re.search(pattern, text, re.IGNORECASE)
            if match and "insurer" not in fields:
                fields["insurer"] = {
                    "value": name,
                    "page": number,
                    "evidence": match.group(),
                }
        if overview:
            continue  # Product ranges and optional features are not a member's policy.
        patterns = {
            "annual_maximum": r"(?:annual|calendar[- ]year)\s+(?:benefit\s+)?maximum\s*[:\-]?\s*\$([\d,]+(?:\.\d{2})?)",
            "deductible": r"(?:individual\s+)?deductible\s*[:\-]?\s*\$([\d,]+(?:\.\d{2})?)",
            "preventive": r"preventive(?:\s+(?:care|services))?\s*[:\-]?\s*(\d{1,3})%",
            "basic": r"basic(?:\s+(?:care|services))?\s*[:\-]?\s*(\d{1,3})%",
            "major": r"major(?:\s+(?:care|services))?\s*[:\-]?\s*(\d{1,3})%",
        }
        for key, pattern in patterns.items():
            for match in re.finditer(pattern, text, re.IGNORECASE):
                tail = text[match.end() : match.end() + 18]
                if re.match(r"\s*(?:[-–]|to|through)\s*\$?\d", tail):
                    continue
                value = float(match[1].replace(",", ""))
                if key in ("preventive", "basic", "major"):
                    if value > 100:
                        continue
                    value /= 100
                candidate = {"value": value, "page": number, "evidence": match.group()}
                fields.setdefault(key, []).append(candidate)
    ambiguous = []
    for key in list(fields):
        if key == "insurer":
            continue
        candidates = fields[key]
        if len({c["value"] for c in candidates}) != 1:
            ambiguous.append(key)
            del fields[key]
        else:
            fields[key] = candidates[0]
    warnings = [
        "Review every candidate: percentages may describe member share or different networks. Unextracted rules, fees and claims history remain demo data."
    ]
    if overview:
        warnings.insert(
            0,
            "General product overview: exact plan benefits still needed. No numeric benefits were imported.",
        )
    if ambiguous:
        warnings.append(
            "Conflicting values need manual review: " + ", ".join(ambiguous)
        )
    if not combined.strip():
        warnings.append(
            "No readable text found. Scanned PDFs need OCR; enter benefits manually."
        )
    return {
        "document_type": "product_overview" if overview else "coverage_document",
        "fields": fields,
        "warnings": warnings,
        "requires_confirmation": True,
    }


@router.post("/extract")
async def extract(file: UploadFile):
    data = await file.read(MAX_BYTES + 1)
    await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "PDF must be 10 MB or smaller")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(422, "Upload a valid PDF")
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > 40:
                raise HTTPException(
                    422, "Use a benefits summary with 40 pages or fewer"
                )
            return extract_pages([p.extract_text() or "" for p in pdf.pages])
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - malformed PDFs must return a readable upload error
        raise HTTPException(
            422, "Could not read this PDF; try an unlocked benefits summary"
        ) from None
