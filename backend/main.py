import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import monte_carlo

app = FastAPI()


class SimulationRequest(BaseModel):
    x0: list[float] = Field(  # 1D, length n: starting probability of each state
        default_factory=lambda: monte_carlo.EXAMPLE_X0.tolist()
    )
    P: list[list[float]] = Field(  # 2D, n x n monthly transition matrix
        default_factory=lambda: monte_carlo.EXAMPLE_P.tolist()
    )
    horizon: int = Field(6, ge=1, le=36)  # months
    n_sims: int = Field(10_000, ge=100, le=100_000)
    seed: int = 0
    max_risk: float = Field(0.10, gt=0, lt=1)  # risk cap that defines "safe to wait"

    # Pre-fills the /docs "Try it out" box with a working example
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "x0": monte_carlo.EXAMPLE_X0.tolist(),
                    "P": monte_carlo.EXAMPLE_P.tolist(),
                    "horizon": 6,
                    "n_sims": 10_000,
                    "seed": 0,
                    "max_risk": 0.1,
                }
            ]
        }
    )


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    try:
        paths, dist, risk = monte_carlo.run_simulation(
            np.array(req.x0), np.array(req.P), req.horizon, req.n_sims, req.seed
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "dist": dist.tolist(),
        "risk": risk.tolist(),
        "summary": monte_carlo.outcome_summary(risk, dist, req.max_risk),
        "sample_paths": paths[:, :100].T.tolist(),  # 100 futures for the animation
    }