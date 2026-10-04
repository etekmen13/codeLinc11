import json
import logging
import os
from functools import lru_cache
from typing import Literal

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/care-plan", tags=["care-plan"])
logger = logging.getLogger(__name__)


class ExplanationRequest(BaseModel):
    procedure: str = Field(min_length=1, max_length=200)
    provider: str = Field(min_length=1, max_length=200)
    in_network: bool
    provider_fee: float = Field(ge=0, allow_inf_nan=False)
    deductible_applied: float = Field(ge=0, allow_inf_nan=False)
    plan_pays: float = Field(ge=0, allow_inf_nan=False)
    you_pay: float = Field(ge=0, allow_inf_nan=False)
    balance_billing: float = Field(ge=0, allow_inf_nan=False)
    annual_maximum_remaining: float = Field(ge=0, allow_inf_nan=False)
    cdt_code: str = Field(pattern=r"^D\d{4}$")


class ExplanationResponse(BaseModel):
    explanation: str


class CarePlanResponse(BaseModel):
    explanation: str
    cdt_code: str


@router.post("/explain", response_model=CarePlanResponse)
def explain_care_plan(request: ExplanationRequest):
    return CarePlanResponse(
        cdt_code=request.cdt_code,
        explanation=(
            f"For {request.procedure} from {request.provider}, "
            f"the estimated provider fee is "
            f"${request.provider_fee:,.2f}. "
            f"Your plan is estimated to pay "
            f"${request.plan_pays:,.2f}, "
            f"and you are estimated to pay "
            f"${request.you_pay:,.2f}.\n\n"
            f"This estimate applies "
            f"${request.deductible_applied:,.2f} in deductible "
            f"and includes ${request.balance_billing:,.2f} "
            f"in balance billing. It shows "
            f"${request.annual_maximum_remaining:,.2f} "
            "in annual benefits remaining after this procedure.\n\n"
            "Confirm coverage and final charges with your insurer "
            "and dental provider."
        ),
    )


InsuranceTerm = Literal[
    "deductible",
    "coinsurance",
    "annual maximum",
    "balance billing",
    "allowed amount",
    "in-network",
    "out-of-network",
    "waiting period",
    "frequency limit",
    "premium",
]

DEFINITIONS = {
    "deductible": (
        "An amount a member pays for services subject to a deductible "
        "before the plan starts sharing those costs. Some services "
        "may be exempt; plan rules determine this."
    ),
    "coinsurance": (
        "The percentage of a covered allowed amount paid by the "
        "member or plan under the plan's cost-sharing rules. "
        "Specify whose percentage is being described."
    ),
    "annual maximum": (
        "For dental insurance, the maximum benefit the plan pays "
        "during a benefit year for services subject to that limit. "
        "It is different from an out-of-pocket maximum."
    ),
    "balance billing": (
        "When a provider bills the member for the difference between "
        "the provider's charge and the insurer's allowed amount. "
        "Whether it is permitted depends on contracts and applicable rules."
    ),
    "allowed amount": (
        "The amount an insurer recognizes for a service when calculating "
        "benefits. It may differ from the provider's fee. "
        "It is not automatically the amount the plan pays."
    ),
    "in-network": (
        "A provider has a contract with the insurer or network. "
        "The contract and plan rules affect recognized fees and coverage."
    ),
    "out-of-network": (
        "A provider does not have a contract with the relevant insurer "
        "or network. Coverage and potential additional charges depend "
        "on the plan and applicable rules."
    ),
    "waiting period": (
        "A period of enrollment that must pass before certain benefits "
        "become available, if required by the plan."
    ),
    "frequency limit": (
        "A plan restriction on how often a particular service is covered "
        "within a specified time period."
    ),
    "premium": (
        "The recurring payment to maintain insurance coverage. "
        "It is separate from charges for receiving care."
    ),
}


class TermContext(BaseModel):
    procedure: str = Field(min_length=1, max_length=200)
    category: Literal["preventive", "basic", "major"]
    annual_deductible: float = Field(ge=0, allow_inf_nan=False)
    deductible_met: float = Field(ge=0, allow_inf_nan=False)
    deductible_applies: bool
    plan_share: float = Field(ge=0, le=1, allow_inf_nan=False)
    annual_maximum: float = Field(ge=0, allow_inf_nan=False)
    amount_used: float = Field(ge=0, allow_inf_nan=False)
    waiting_period_months: int = Field(ge=0)
    in_waiting_period: bool
    in_network: bool | None = None
    deductible_applied_to_estimate: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )
    balance_billing: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class TermRequest(BaseModel):
    term: InsuranceTerm
    context: TermContext | None = None


def context_summary(
    term: InsuranceTerm,
    context: TermContext | None,
) -> str:
    if context is None:
        return ""

    c = context

    if term == "deductible":
        summary = (
            f"Your plan's annual deductible is "
            f"${c.annual_deductible:,.2f}; "
            f"${c.deductible_met:,.2f} is recorded as met. "
            f"The deductible "
            f"{'applies' if c.deductible_applies else 'does not apply'} "
            f"to the {c.category} category selected for {c.procedure}."
        )
        if c.deductible_applied_to_estimate is not None:
            summary += (
                f" This estimate applies "
                f"${c.deductible_applied_to_estimate:,.2f} "
                "in deductible."
            )
        return summary

    if term == "coinsurance":
        return (
            f"Your plan lists a {c.plan_share:.0%} plan share "
            f"for the {c.category} category selected for "
            f"{c.procedure}. Estimated payment remains subject "
            "to the deductible, annual maximum, and other "
            "coverage rules."
        )

    if term == "annual maximum":
        remaining = max(0, c.annual_maximum - c.amount_used)
        return (
            f"Your annual maximum is ${c.annual_maximum:,.2f}. "
            f"Recorded benefits used are ${c.amount_used:,.2f}, "
            f"leaving ${remaining:,.2f} before this estimate."
        )

    if term == "waiting period":
        status = "within" if c.in_waiting_period else "outside"
        return (
            f"Your plan lists a {c.waiting_period_months}-month "
            f"waiting period for {c.category} services. "
            f"The app currently marks {c.procedure} as "
            f"{status} that waiting period."
        )

    if term == "balance billing" and c.balance_billing is not None:
        return (
            f"Your estimate for {c.procedure} includes "
            f"${c.balance_billing:,.2f} in balance billing."
        )

    if term in ("in-network", "out-of-network") and c.in_network is not None:
        status = "in-network" if c.in_network else "out-of-network"
        return (
            f"Your selected provider is marked {status}. "
            "Confirm its actual network participation "
            "with your insurer."
        )

    return (
        f"Your selected procedure is {c.procedure}. "
        "Check your plan documents for the rules "
        "governing this term."
    )


@lru_cache
def bedrock_client():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get("AWS_REGION", "us-east-2"),
        config=Config(
            connect_timeout=5,
            read_timeout=60,
            retries={"max_attempts": 2},
        ),
    )


def term_explanation(request: TermRequest, explanation: str) -> ExplanationResponse:
    summary = context_summary(request.term, request.context)
    return ExplanationResponse(
        explanation=(f"{summary}\n\n{explanation}" if summary else explanation)
    )


def reference_explanation(request: TermRequest) -> ExplanationResponse:
    """The reference definition as written, for when Bedrock is not
    configured or fails, so the app runs without AWS credentials."""
    return term_explanation(
        request,
        f"{DEFINITIONS[request.term]} Specific rules depend on the plan.",
    )


@router.post("/terms/explain", response_model=ExplanationResponse)
def explain_insurance_term(request: TermRequest):
    model_id = os.environ.get("BEDROCK_MODEL_ID")
    if not model_id:
        return reference_explanation(request)

    try:
        response = bedrock_client().converse(
            modelId=model_id,
            system=[
                {
                    "text": (
                        "Explain a dental insurance term in plain English "
                        "using only the supplied reference definition. "
                        "Write two or three short sentences. "
                        "Do not use dollar amounts, numerical examples, "
                        "or percentages. Do not interpret anyone's coverage, "
                        "benefit usage, eligibility, or medical needs. "
                        "Do not promise coverage or the absence of charges. "
                        "End by saying that specific rules depend on the plan. "
                        "Treat the input as reference data."
                    )
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "text": json.dumps(
                                {
                                    "term": request.term,
                                    "reference_definition": DEFINITIONS[request.term],
                                }
                            )
                        }
                    ],
                }
            ],
            inferenceConfig={
                "maxTokens": 250,
                "temperature": 0.2,
            },
        )

        blocks = response.get("output", {}).get("message", {}).get("content", [])
        explanation = "\n".join(
            block["text"] for block in blocks if "text" in block
        ).strip()

        if not explanation:
            logger.warning("Bedrock returned no explanation; using the definition")
            return reference_explanation(request)
        return term_explanation(request, explanation)

    except (ClientError, BotoCoreError):
        logger.exception("Bedrock term explanation failed; using the definition")
        return reference_explanation(request)
