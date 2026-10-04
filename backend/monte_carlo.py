"""Monte Carlo simulation of how one untreated tooth progresses over time.

Input:  x0, a 1D array of length n (starting probability of each state)
        P,  a 3D k x n x n array: one n x n transition matrix per simulated future.
            The number of simulations is k = len(P); future i uses P[i] every month.
Output: numpy arrays (paths, dist, risk). No fees or insurance here: the
        care-plan sequencer prices each state's treatment with the cost engine.

Main entry: simulate(onboarded) runs the onboarding's tooth through the
progression model and returns a SimulationResult. States are
progression.STATES; month 0 is today.
"""

from dataclasses import dataclass
from typing import ClassVar, Literal

import numpy as np
from numpy.typing import NDArray

from handoff import N_SAMPLES, build_simulation_input
from onboarding import Onboarded
from progression import STATE_INDEX, STATES

# Two years: past any plan-year reset, with a year to spare.
HORIZON_MONTHS = 24

RiskBand = Literal["low", "medium", "high"]


def run_simulation(
    x0: NDArray[np.float64],
    P: NDArray[np.float64],
    horizon: int = HORIZON_MONTHS,
    seed: int | np.random.Generator = 0,
) -> tuple[NDArray[np.int64], NDArray[np.float64], NDArray[np.float64]]:
    """Simulate k = len(P) possible futures for `horizon` months.

    P: (k, n, n). Future i moves according to P[i] every month.
    seed: an int, or a Generator to share one random stream with the caller.
    States must be ordered from best to worst, as progression.STATES is.

    Returns:
        paths: int array (horizon+1, k), state of each future at each month
        dist:  float array (horizon+1, n), share of futures in each state per month
        risk:  float array (horizon+1,), share of futures worse than where they started
    """
    x0 = np.asarray(x0, dtype=float)
    P = np.asarray(P, dtype=float)
    if x0.ndim != 1:
        raise ValueError("x0 must be a 1D array")
    n = len(x0)
    if (x0 < 0).any() or not np.isclose(x0.sum(), 1):
        raise ValueError("x0 must be non-negative and sum to 1")
    if P.ndim != 3 or P.shape[1:] != (n, n):
        raise ValueError(f"P must be k x {n} x {n}, got {P.shape}")
    if (P < 0).any() or not np.allclose(P.sum(axis=2), 1):
        raise ValueError(
            "every row of every matrix in P must be non-negative and sum to 1"
        )
    k = len(P)

    rng = np.random.default_rng(seed)
    paths = np.empty((horizon + 1, k), dtype=np.int64)
    paths[0] = rng.choice(n, size=k, p=x0)  # starting state of each future

    cum = P.cumsum(axis=2)  # cum[i, s] splits [0,1] into one interval per next state
    futures = np.arange(k)
    for t in range(1, horizon + 1):
        u = rng.random(k)  # one dice roll per future
        rows = cum[futures, paths[t - 1]]  # future i's current row of its own P[i]
        nxt = (u[:, None] > rows).sum(axis=1)
        paths[t] = np.minimum(nxt, n - 1)  # guard against float rounding

    dist = np.stack([np.bincount(row, minlength=n) for row in paths]) / k
    risk = (paths > paths[0]).mean(axis=1)
    return paths, dist, risk


def risk_band(r: float, low: float = 0.10, high: float = 0.25) -> RiskBand:
    """low: under `low`, medium: `low` to `high`, high: over `high`."""
    if r < low:
        return "low"
    if r <= high:
        return "medium"
    return "high"


@dataclass(frozen=True)
class BandSegment:
    band: RiskBand
    start_month: int
    end_month: int  # inclusive


@dataclass(frozen=True)
class OutcomeSummary:
    recommended_window_months: int  # end of the low-risk band
    low_threshold: float
    high_threshold: float
    bands: tuple[RiskBand, ...]  # band for each month 0..horizon
    # First month each band starts and last month it ends (None if it never occurs)
    band_ranges: dict[RiskBand, BandSegment | None]
    # Consecutive runs, in order; lists a band twice if risk dips back
    band_segments: tuple[BandSegment, ...]
    risk_at_window: float
    risk_at_horizon: float
    worst_state_at_horizon: float  # share of futures in the last (worst) state


def outcome_summary(
    risk: NDArray[np.float64],
    dist: NDArray[np.float64],
    low: float = 0.10,
    high: float = 0.25,
) -> OutcomeSummary:
    """Numbers for the Outcome Summary: risk band per month + recommended window.

    low, high: escalation-probability cutoffs between the bands.
    """
    if not 0 < low < high < 1:
        raise ValueError("need 0 < low < high < 1")
    bands = tuple(risk_band(float(r), low, high) for r in risk)

    def last_month_before(bad: set[RiskBand]) -> int | None:
        # last month before the band first reaches one of `bad`
        # (None if that never happens within the horizon)
        for t, b in enumerate(bands):
            if b in bad:
                return t - 1
        return None

    # Consecutive runs of the same band, e.g. low 0-2, medium 3-7, high 8-24
    segments: list[BandSegment] = []
    for t, b in enumerate(bands):
        if segments and segments[-1].band == b:
            segments[-1] = BandSegment(b, segments[-1].start_month, t)
        else:
            segments.append(BandSegment(b, t, t))

    band_ranges: dict[RiskBand, BandSegment | None] = {}
    for name in ("low", "medium", "high"):
        months = [t for t, b in enumerate(bands) if b == name]
        band_ranges[name] = BandSegment(name, months[0], months[-1]) if months else None

    horizon = len(risk) - 1
    low_until = last_month_before({"medium", "high"})
    window = horizon if low_until is None else max(low_until, 0)
    return OutcomeSummary(
        recommended_window_months=window,
        low_threshold=low,
        high_threshold=high,
        bands=bands,
        band_ranges=band_ranges,
        band_segments=tuple(segments),
        risk_at_window=float(risk[window]),
        risk_at_horizon=float(risk[-1]),
        worst_state_at_horizon=float(dist[-1, -1]),
    )


@dataclass(frozen=True)
class SimulationResult:
    """How one untreated tooth may progress, month by month from today.

    For the sequencer: the expected cost of treating at month t is the sum
    over states s of dist[t, s] times the cost of treating s on that date.
    Compare candidate schedules on the same result so sampling noise cannot
    flip a decision.
    """

    states: ClassVar[tuple[str, ...]] = STATES
    start_state: str
    dist: NDArray[np.float64]  # (horizon+1, n_states): P(state s at month t)
    risk: NDArray[np.float64]  # (horizon+1,): P(worse than start_state at month t)
    paths: NDArray[np.int64]  # (horizon+1, n_samples): state index of each future
    summary: OutcomeSummary

    @property
    def horizon(self) -> int:
        return len(self.risk) - 1

    def state_probabilities(self, month: int) -> dict[str, float]:
        if not 0 <= month <= self.horizon:
            raise ValueError(f"month must be between 0 and {self.horizon}")
        return {s: float(p) for s, p in zip(self.states, self.dist[month], strict=True)}


def simulate(
    onboarded: Onboarded,
    horizon: int = HORIZON_MONTHS,
    n_samples: int = N_SAMPLES,
    seed: int = 0,
) -> SimulationResult:
    """Simulate the onboarding's tooth, starting at the state its procedure
    treats. One seeded stream drives both the per-future hazard multipliers
    and the monthly moves, so the same request gives the same result."""
    rng = np.random.default_rng(seed)
    sim_input = build_simulation_input(onboarded, n_samples, rng)
    paths, dist, risk = run_simulation(
        sim_input.start_vector, sim_input.matrices, horizon, rng
    )
    return SimulationResult(
        start_state=onboarded.procedure.treats_state,
        dist=dist,
        risk=risk,
        paths=paths,
        summary=outcome_summary(risk, dist),
    )


def _check() -> None:
    # risk compares state indices, so STATES must run from best to worst.
    if STATE_INDEX["healthy"] != 0 or STATE_INDEX["extraction"] != len(STATES) - 1:
        raise ValueError("progression.STATES must be ordered best to worst")


_check()
