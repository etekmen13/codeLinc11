"""Risk quiz: the single source of truth for quiz questions and how each
answer scales transition hazards.

Pure logic, no HTTP: onboarding.py serves the questions (without factors)
and calls validate_answers and log_multipliers.

Factors are placeholders: plausible in direction, not clinically calibrated.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from progression import (
    CAVITY_TO_ROOT_CANAL,
    EDGE_INDEX,
    EDGES,
    HEALTHY_TO_LESION,
    LESION_TO_CAVITY,
    LESION_TO_HEALTHY,
    ROOT_CANAL_TO_EXTRACTION,
    STATE_INDEX,
    Edge,
)


@dataclass(frozen=True)
class Option:
    id: str
    label: str
    # Multiplier on each listed edge's hazard; unlisted edges get 1.0.
    factors: dict[Edge, float]


@dataclass(frozen=True)
class Question:
    id: str
    prompt: str
    options: tuple[Option, ...]
    # Starting states for which the question is asked; None means all.
    applies_to: frozenset[str] | None = None


# Edges driven by general decay risk.
CARIES = (HEALTHY_TO_LESION, LESION_TO_CAVITY)


def on(edges: tuple[Edge, ...], factor: float) -> dict[Edge, float]:
    return {e: factor for e in edges}


TOOTH_SYMPTOMS = frozenset({"cavity", "root_canal"})

QUESTIONS: tuple[Question, ...] = (
    Question(
        id="sugar",
        prompt="How often do you have sugary snacks or drinks between meals?",
        options=(
            Option("rarely", "Rarely", on(CARIES, 0.8)),
            Option("daily", "Once or twice a day", {}),
            Option(
                "often",
                "Three or more times a day",
                on(CARIES, 1.5) | {LESION_TO_HEALTHY: 0.8, CAVITY_TO_ROOT_CANAL: 1.2},
            ),
        ),
    ),
    Question(
        id="brushing",
        prompt="How often do you brush with fluoride toothpaste?",
        options=(
            Option(
                "twice",
                "Twice a day or more",
                on(CARIES, 0.85) | {LESION_TO_HEALTHY: 1.3},
            ),
            Option("once", "Once a day", {}),
            Option(
                "less",
                "Less than once a day",
                on(CARIES, 1.4) | {LESION_TO_HEALTHY: 0.7, CAVITY_TO_ROOT_CANAL: 1.1},
            ),
        ),
    ),
    Question(
        id="dry_mouth",
        prompt="Does your mouth often feel dry?",
        options=(
            Option("no", "No", {}),
            Option("sometimes", "Sometimes", on(CARIES, 1.15)),
            Option(
                "often",
                "Often",
                on(CARIES, 1.4) | {LESION_TO_HEALTHY: 0.8, CAVITY_TO_ROOT_CANAL: 1.15},
            ),
        ),
    ),
    Question(
        id="recent_cavities",
        prompt="How many cavities have you had filled in the last 3 years?",
        options=(
            Option("none", "None", on(CARIES, 0.8)),
            Option("one", "One", on(CARIES, 1.1)),
            Option(
                "two_plus",
                "Two or more",
                on(CARIES, 1.5) | {CAVITY_TO_ROOT_CANAL: 1.1},
            ),
        ),
    ),
    Question(
        id="last_cleaning",
        prompt="When was your last dental cleaning?",
        options=(
            Option("under_6mo", "Within 6 months", on(CARIES, 0.9)),
            Option("6_12mo", "6 to 12 months ago", {}),
            Option("over_1yr", "More than a year ago", on(CARIES, 1.25)),
        ),
    ),
    Question(
        # Lingering pain after cold suggests the nerve is involved.
        id="cold_sensitivity",
        prompt="Does the tooth hurt with cold or sweets?",
        applies_to=TOOTH_SYMPTOMS,
        options=(
            Option("no", "No", {CAVITY_TO_ROOT_CANAL: 0.9}),
            Option("brief", "Briefly, then it stops", {CAVITY_TO_ROOT_CANAL: 1.1}),
            Option(
                "lingers",
                "Yes, and the pain lingers",
                {CAVITY_TO_ROOT_CANAL: 1.6, ROOT_CANAL_TO_EXTRACTION: 1.2},
            ),
        ),
    ),
    Question(
        id="biting_pain",
        prompt="Does the tooth hurt when you bite down?",
        applies_to=TOOTH_SYMPTOMS,
        options=(
            Option("no", "No", {}),
            Option(
                "yes",
                "Yes",
                {CAVITY_TO_ROOT_CANAL: 1.3, ROOT_CANAL_TO_EXTRACTION: 1.2},
            ),
        ),
    ),
)

_QUESTIONS_BY_ID: dict[str, Question] = {q.id: q for q in QUESTIONS}
_OPTIONS: dict[tuple[str, str], Option] = {
    (q.id, o.id): o for q in QUESTIONS for o in q.options
}

# Clamp each edge's combined multiplier to [1/4, 4] so a few extreme
# answers cannot make the simulation degenerate.
LOG_MIN = np.log(0.25)
LOG_MAX = np.log(4.0)


def questions_for(state: str) -> list[Question]:
    return [q for q in QUESTIONS if q.applies_to is None or state in q.applies_to]


def validate_answers(state: str, answers: dict[str, str]) -> list[str]:
    """Return every problem with the answers; an empty list means valid."""
    expected = {q.id: q for q in questions_for(state)}
    problems: list[str] = []
    for qid, oid in answers.items():
        if qid not in _QUESTIONS_BY_ID:
            problems.append(f"unknown question {qid!r}")
        elif qid not in expected:
            problems.append(f"question {qid!r} does not apply to state {state!r}")
        elif (qid, oid) not in _OPTIONS:
            problems.append(f"unknown option {oid!r} for question {qid!r}")
    for qid in sorted(expected.keys() - answers.keys()):
        problems.append(f"question {qid!r} was not answered")
    return problems


def log_multipliers(answers: dict[str, str]) -> NDArray[np.float64]:
    """Per-edge log hazard multipliers, shape (len(EDGES),), ordered as EDGES.

    Factors from different answers multiply, so their logs add. Call
    validate_answers first; unknown ids raise KeyError here.
    """
    log_m = np.zeros(len(EDGES))
    for qid, oid in answers.items():
        for edge, factor in _OPTIONS[(qid, oid)].factors.items():
            log_m[EDGE_INDEX[edge]] += np.log(factor)
    return np.clip(log_m, LOG_MIN, LOG_MAX)


def _check() -> None:
    if len(_QUESTIONS_BY_ID) != len(QUESTIONS):
        raise ValueError("duplicate question id")
    for q in QUESTIONS:
        if len({o.id for o in q.options}) != len(q.options):
            raise ValueError(f"duplicate option id in question {q.id!r}")
        if q.applies_to and not q.applies_to <= STATE_INDEX.keys():
            raise ValueError(f"question {q.id!r} applies to an unknown state")
        for o in q.options:
            for edge, factor in o.factors.items():
                if edge not in EDGE_INDEX or factor <= 0:
                    raise ValueError(f"bad factor {edge}={factor} in {q.id}/{o.id}")


_check()
