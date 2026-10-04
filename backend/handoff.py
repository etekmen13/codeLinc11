"""Turns a validated onboarding into the arrays the Monte Carlo consumes.

Each trajectory gets its own transition matrix: the quiz gives a point
estimate of each edge's hazard multiplier, and each trajectory draws its
multipliers from a lognormal centred (in median) on that estimate.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

import quiz
from onboarding import Onboarded
from progression import MULTIPLIER_SIGMA, STATE_INDEX, STATES, transition_matrix

N_SAMPLES = 10_000


@dataclass(frozen=True)
class SimulationInput:
    onboarded: Onboarded
    start_vector: NDArray[np.float64]  # (n_states,), one-hot at month 0
    multipliers: NDArray[np.float64]  # (n_samples, n_edges), ordered as EDGES
    matrices: NDArray[np.float64]  # (n_samples, n_states, n_states)


def build_simulation_input(
    onboarded: Onboarded,
    n_samples: int = N_SAMPLES,
    rng: np.random.Generator | None = None,
) -> SimulationInput:
    rng = rng or np.random.default_rng()
    log_m = quiz.log_multipliers(onboarded.quiz_answers)
    multipliers = rng.lognormal(log_m, MULTIPLIER_SIGMA, (n_samples, len(log_m)))
    start_vector = np.zeros(len(STATES))
    start_vector[STATE_INDEX[onboarded.procedure.treats_state]] = 1.0
    return SimulationInput(
        onboarded=onboarded,
        start_vector=start_vector,
        multipliers=multipliers,
        matrices=transition_matrix(multipliers),
    )
