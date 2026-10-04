"""Monte Carlo simulation of how one untreated tooth progresses over time.

Input:  x0, a 1D array of length n (starting probability of each state)
        P,  a 3D k x n x n array: one n x n transition matrix per simulated future.
            The number of simulations is k = len(P); future i uses P[i] every month.
Output: numpy arrays (paths, dist, risk). No fees or insurance here: the
        care-plan sequencer prices each state's treatment with the cost engine.

Main entry: simulate(onboarded) runs the onboarding's tooth through the
progression model and returns a SimulationResult. States are
progression.STATES; month 0 is the member's as_of date.

Risk bands describe how likely the tooth is to be worse than it is now. They
are information for the employee, not a treatment recommendation.
"""

from dataclasses import dataclass
from datetime import date
from itertools import pairwise
from typing import ClassVar

import numpy as np
from numpy.typing import NDArray

from handoff import N_SAMPLES, build_simulation_input
from onboarding import Onboarded
from progression import STATE_INDEX, STATES

# Two years: past any plan-year reset, with a year to spare.
HORIZON_MONTHS = 24


@dataclass(frozen=True)
class RiskBand:
    name: str
    # Escalation probabilities below this fall in the band; None means no
    # limit, which only the last band has.
    upper: float | None


# Ordered from least to most risk; band i covers [band i-1's upper, upper).
# Add, remove, or move bands here: nothing else hardcodes them.
RISK_BANDS: tuple[RiskBand, ...] = (
    RiskBand("low", 0.10),
    RiskBand("medium", 0.25),
    RiskBand("high", None),
)


def check_bands(bands: tuple[RiskBand, ...]) -> None:
    if not bands:
        raise ValueError("need at least one risk band")
    if len({b.name for b in bands}) != len(bands):
        raise ValueError("risk band names must be unique")
    if bands[-1].upper is not None:
        raise ValueError("the last risk band must have no upper limit")
    limits = [0.0]
    for b in bands[:-1]:
        if b.upper is None:
            raise ValueError("only the last risk band can have no upper limit")
        limits.append(b.upper)
    limits.append(1.0)
    if any(a >= b for a, b in pairwise(limits)):
        raise ValueError("risk band limits must increase strictly within (0, 1)")


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


def risk_band(r: float, bands: tuple[RiskBand, ...] = RISK_BANDS) -> str:
    """Name of the first band whose upper limit is above r."""
    for b in bands:
        if b.upper is None or r < b.upper:
            return b.name
    raise ValueError("the last risk band must have no upper limit")


@dataclass(frozen=True)
class BandSegment:
    band: str
    start_month: int
    end_month: int  # inclusive


@dataclass(frozen=True)
class OutcomeSummary:
    # Last month before risk first leaves the lowest band (the horizon if it
    # never does).
    low_risk_until_month: int
    band_limits: tuple[RiskBand, ...]  # the bands used, least risk first
    bands: tuple[str, ...]  # band name for each month 0..horizon
    # First month each band starts and last month it ends (None if it never
    # occurs), keyed by every band in band_limits
    band_ranges: dict[str, BandSegment | None]
    # Consecutive runs, in order; lists a band twice if risk dips back
    band_segments: tuple[BandSegment, ...]
    risk_at_low_risk_until: float
    risk_at_horizon: float
    worst_state_at_horizon: float  # share of futures in the last (worst) state


def outcome_summary(
    risk: NDArray[np.float64],
    dist: NDArray[np.float64],
    bands: tuple[RiskBand, ...] = RISK_BANDS,
) -> OutcomeSummary:
    """Numbers for the Outcome Summary: the risk band for each month and how
    long risk stays in the lowest band."""
    check_bands(bands)
    by_month = tuple(risk_band(float(r), bands) for r in risk)

    # Consecutive runs of the same band, e.g. low 0-2, medium 3-7, high 8-24
    segments: list[BandSegment] = []
    for t, b in enumerate(by_month):
        if segments and segments[-1].band == b:
            segments[-1] = BandSegment(b, segments[-1].start_month, t)
        else:
            segments.append(BandSegment(b, t, t))

    band_ranges: dict[str, BandSegment | None] = {}
    for band in bands:
        months = [t for t, b in enumerate(by_month) if b == band.name]
        band_ranges[band.name] = (
            BandSegment(band.name, months[0], months[-1]) if months else None
        )

    horizon = len(risk) - 1
    lowest = bands[0].name
    left = next((t for t, b in enumerate(by_month) if b != lowest), None)
    until = horizon if left is None else max(left - 1, 0)
    return OutcomeSummary(
        low_risk_until_month=until,
        band_limits=bands,
        bands=by_month,
        band_ranges=band_ranges,
        band_segments=tuple(segments),
        risk_at_low_risk_until=float(risk[until]),
        risk_at_horizon=float(risk[-1]),
        worst_state_at_horizon=float(dist[-1, -1]),
    )


@dataclass(frozen=True)
class SimulationResult:
    """How one untreated tooth may progress, month by month from start_date.

    For the sequencer: the expected cost of treating at month t is the sum
    over states s of dist[t, s] times the cost of treating s on that date.
    Compare candidate schedules on the same result so sampling noise cannot
    flip a decision.
    """

    states: ClassVar[tuple[str, ...]] = STATES
    start_state: str
    start_date: date  # month 0: the onboarding's as_of date
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
    bands: tuple[RiskBand, ...] = RISK_BANDS,
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
        start_date=onboarded.as_of,
        dist=dist,
        risk=risk,
        paths=paths,
        summary=outcome_summary(risk, dist, bands),
    )


def _check() -> None:
    check_bands(RISK_BANDS)
    # risk compares state indices, so STATES must run from best to worst.
    if STATE_INDEX["healthy"] != 0 or STATE_INDEX["extraction"] != len(STATES) - 1:
        raise ValueError("progression.STATES must be ordered best to worst")


_check()
