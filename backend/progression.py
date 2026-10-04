"""Tooth progression model: the fixed set of states and allowed transitions.

Every procedure starts the simulation at one of these states, and every quiz
answer scales the hazard on some of these edges. Base rates and the
uncertainty settings for the Monte Carlo belong in this module too.
"""

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


def _check() -> None:
    for a, b in EDGES:
        if a not in STATE_INDEX or b not in STATE_INDEX:
            raise ValueError(f"edge {(a, b)} uses an unknown state")


_check()
