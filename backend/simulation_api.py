"""Simulation endpoint: how the untreated tooth may progress, month by month.

Endpoint:
  POST /api/simulation   OnboardingRequest -> SimulationOut

Returns the reporting simulation the care plan endpoints use
(sequencer.simulations), so the risk bands here match the `risk` field of
/api/care-plan/compare and /api/care-plan/sequence for the same request.

Like the other endpoints, the backend keeps no session: the request carries
the onboarding answers and is validated with validate_onboarding. The
numbers are deterministic for a given request (seeded simulation).
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cost import add_months
from monte_carlo import RISK_BANDS, OutcomeSummary, RiskBand
from onboarding import InvalidOnboarding, OnboardingRequest, validate_onboarding
from sequencer import simulations

# Futures sent whole, for drawing individual paths. Futures are independent
# draws, so the first ones are a random sample.
N_SAMPLE_PATHS = 300


# Response model. Field names match frontend/src/types.ts.


class SimulationOut(BaseModel):
    as_of: date  # month 0
    start_state: str
    states: list[str]  # best to worst; indexes dist and sample_paths
    horizon: int  # months after as_of
    n_samples: int  # futures simulated
    month_dates: list[date]  # as_of plus m months, for m in 0..horizon
    dist: list[list[float]]  # [month][state]: share of futures in that state
    risk: list[float]  # [month]: share of futures worse than start_state
    summary: OutcomeSummary
    risk_bands: list[RiskBand]
    sample_paths: list[list[int]]  # [future][month]: state index


router = APIRouter(prefix="/api", tags=["simulation"])


@router.post("/simulation")
def post_simulation(req: OnboardingRequest) -> SimulationOut:
    try:
        o = validate_onboarding(req)
    except InvalidOnboarding as e:
        raise HTTPException(422, e.problems) from e

    _, sim = simulations(o)
    return SimulationOut(
        as_of=o.as_of,
        start_state=sim.start_state,
        states=list(sim.states),
        horizon=sim.horizon,
        n_samples=sim.paths.shape[1],
        month_dates=[add_months(o.as_of, m) for m in range(sim.horizon + 1)],
        dist=sim.dist.tolist(),
        risk=sim.risk.tolist(),
        summary=sim.summary,
        risk_bands=list(RISK_BANDS),
        sample_paths=sim.paths[:, :N_SAMPLE_PATHS].T.tolist(),
    )
