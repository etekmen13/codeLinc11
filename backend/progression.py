"""Tooth progression model: the fixed set of states and allowed transitions.

Every procedure starts the simulation at one of these states, and every quiz
answer scales the hazard on some of these edges. Base rates and the
uncertainty settings for the Monte Carlo belong in this module too.
"""

import numpy as np
from numpy.typing import NDArray

STATES: tuple[str, ...] = (
    "healthy",
    "early_lesion",
    "cavity",
    "root_canal",
    "extraction",
)
STATE_INDEX: dict[str, int] = {s: i for i, s in enumerate(STATES)}

Edge = tuple[str, str]

# Named constants so a typo is a NameError at import, not a silent miss.
HEALTHY_TO_LESION: Edge = ("healthy", "early_lesion")
LESION_TO_HEALTHY: Edge = ("early_lesion", "healthy")  # remineralization
LESION_TO_CAVITY: Edge = ("early_lesion", "cavity")
CAVITY_TO_ROOT_CANAL: Edge = ("cavity", "root_canal")
ROOT_CANAL_TO_EXTRACTION: Edge = ("root_canal", "extraction")

# This order fixes the index of each edge in every per-edge array.
EDGES: tuple[Edge, ...] = (
    HEALTHY_TO_LESION,
    LESION_TO_HEALTHY,
    LESION_TO_CAVITY,
    CAVITY_TO_ROOT_CANAL,
    ROOT_CANAL_TO_EXTRACTION,
)
EDGE_INDEX: dict[Edge, int] = {e: i for i, e in enumerate(EDGES)}


def edge_name(edge: Edge) -> str:
    return f"{edge[0]}->{edge[1]}"


# Placeholder monthly probability of each move at baseline risk, ordered as
# EDGES. Plausible in magnitude, not clinically calibrated.
BASE_MONTHLY_P: tuple[float, ...] = (
    0.02,  # healthy -> early_lesion
    0.05,  # early_lesion -> healthy
    0.06,  # early_lesion -> cavity
    0.04,  # cavity -> root_canal
    0.02,  # root_canal -> extraction
)

# Spread of each quiz multiplier around its point estimate, in log space.
# Placeholder: 0.25 puts ~95% of draws within x0.6 to x1.6 of the median.
MULTIPLIER_SIGMA = 0.25

_SRC = np.array([STATE_INDEX[a] for a, _ in EDGES])
_DST = np.array([STATE_INDEX[b] for _, b in EDGES])


def transition_matrix(multipliers: NDArray[np.float64]) -> NDArray[np.float64]:
    """Monthly transition matrices with each edge's hazard scaled.

    multipliers has shape (..., len(EDGES)); the result has shape
    (..., len(STATES), len(STATES)) and each row sums to 1.

    Each base probability p comes from a constant hazard -log(1 - p), which
    the multiplier scales, so a single exit becomes 1 - (1 - p) ** m and
    stays in [0, 1]. Exits that share a source state split that state's
    total exit probability in proportion to their hazards.
    """
    m = np.asarray(multipliers, dtype=np.float64)
    hazard = -np.log1p(-np.array(BASE_MONTHLY_P)) * m
    n = len(STATES)
    src_onehot = (_SRC[:, None] == np.arange(n)).astype(np.float64)  # (edges, states)
    total = hazard @ src_onehot  # summed hazard out of each state
    leave = -np.expm1(-total)  # 1 - exp(-total)
    P = np.zeros((*m.shape[:-1], n, n))
    P[..., _SRC, _DST] = leave[..., _SRC] * hazard / total[..., _SRC]
    idx = np.arange(n)
    P[..., idx, idx] = np.exp(-total)
    return P


def _check() -> None:
    for a, b in EDGES:
        if a not in STATE_INDEX or b not in STATE_INDEX:
            raise ValueError(f"edge {(a, b)} uses an unknown state")
    if len(BASE_MONTHLY_P) != len(EDGES):
        raise ValueError("BASE_MONTHLY_P needs one entry per edge")


_check()
