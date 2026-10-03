"""Monte Carlo simulation of how one tooth's condition progresses over time.

Input:  x0, a 1D array of length n (starting probability of each state)
        P,  a 2D n x n array (P[i, j] = chance of moving from state i to j in a month)
Output: numpy arrays (paths, dist, risk). No fees or insurance here.
"""

import numpy as np

# Example data, used only as parameter defaults (4 states, illustrative rates).
# States: 0 Cavity, 1 Deep cavity, 2 Root canal needed, 3 Tooth lost
EXAMPLE_X0 = np.array([1.0, 0.0, 0.0, 0.0])  # starts as a cavity
EXAMPLE_P = np.array(
    [
        [0.96, 0.04, 0.00, 0.00],
        [0.00, 0.94, 0.06, 0.00],
        [0.00, 0.00, 0.95, 0.05],
        [0.00, 0.00, 0.00, 1.00],
    ]
)


def run_simulation(x0=EXAMPLE_X0, P=EXAMPLE_P, horizon=6, n_sims=10_000, seed=0):
    """Simulate n_sims possible futures for `horizon` months.

    Returns:
        paths: int array (horizon+1, n_sims), state of each future at each month
        dist:  float array (horizon+1, n), share of futures in each state per month
        risk:  float array (horizon+1,), share of futures worse than where they started
    """
    x0 = np.asarray(x0, dtype=float)
    P = np.asarray(P, dtype=float)
    n = len(x0)
    if x0.ndim != 1:
        raise ValueError("x0 must be a 1D array")
    if P.shape != (n, n):
        raise ValueError(f"P must be {n} x {n} to match x0, got {P.shape}")
    if (x0 < 0).any() or not np.isclose(x0.sum(), 1):
        raise ValueError("x0 must be non-negative and sum to 1")
    if (P < 0).any() or not np.allclose(P.sum(axis=1), 1):
        raise ValueError("each row of P must be non-negative and sum to 1")

    rng = np.random.default_rng(seed)
    paths = np.empty((horizon + 1, n_sims), dtype=int)
    paths[0] = rng.choice(n, size=n_sims, p=x0)  # starting state of each future

    cum = P.cumsum(axis=1)  # row i splits [0,1] into one interval per next state
    for t in range(1, horizon + 1):
        u = rng.random(n_sims)  # one dice roll per future
        nxt = (u[:, None] > cum[paths[t - 1]]).sum(axis=1)
        paths[t] = np.minimum(nxt, n - 1)  # guard against float rounding

    dist = np.stack([np.bincount(row, minlength=n) for row in paths]) / n_sims
    risk = (paths > paths[0]).mean(axis=1)
    return paths, dist, risk


def outcome_summary(risk, dist, max_risk=0.10):
    """Numbers for the Outcome Summary."""
    under_cap = np.flatnonzero(risk <= max_risk)
    window = int(under_cap.max()) if len(under_cap) else 0
    return {
        "safe_window_months": window,
        "max_risk": max_risk,
        "risk_at_window": float(risk[window]),
        "risk_at_horizon": float(risk[-1]),
        "worst_state_at_horizon": float(dist[-1, -1]),
    }