"""Monte Carlo simulation of how one tooth's condition progresses over time.

Input:  x0, a 1D array of length n (starting probability of each state)
        P,  a 3D k x n x n array: one n x n transition matrix per simulated future.
            The number of simulations is k = len(P); future i uses P[i] every month.
Output: numpy arrays (paths, dist, risk). No fees or insurance here.
"""

import numpy as np

# Example data, used only as parameter defaults (4 states, illustrative rates).
# States: 0 Cavity, 1 Deep cavity, 2 Root canal needed, 3 Tooth lost
EXAMPLE_X0 = np.array([1.0, 0.0, 0.0, 0.0])  # starts as a cavity
_EXAMPLE_MATRIX = np.array(
    [
        [0.96, 0.04, 0.00, 0.00],
        [0.00, 0.94, 0.06, 0.00],
        [0.00, 0.00, 0.95, 0.05],
        [0.00, 0.00, 0.00, 1.00],
    ]
)
# 10,000 simulations, all using the same matrix (k = 10,000)
EXAMPLE_P = np.broadcast_to(_EXAMPLE_MATRIX, (10_000, 4, 4))


def run_simulation(x0=EXAMPLE_X0, P=EXAMPLE_P, horizon=6, seed=0):
    """Simulate k = len(P) possible futures for `horizon` months.

    P: (k, n, n). Future i moves according to P[i] every month.

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
    paths = np.empty((horizon + 1, k), dtype=int)
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


def risk_band(r, low=0.10, high=0.25):
    """low: under `low`, medium: `low` to `high`, high: over `high`."""
    if r < low:
        return "low"
    if r <= high:
        return "medium"
    return "high"


def outcome_summary(risk, dist, low=0.10, high=0.25):
    """Numbers for the Outcome Summary: risk band per month + recommended window.

    low, high: escalation-probability cutoffs between the bands.
    """
    if not 0 < low < high < 1:
        raise ValueError("need 0 < low < high < 1")
    bands = [risk_band(float(r), low, high) for r in risk]

    def last_month_before(bad):
        # last month before the band first reaches one of `bad`
        # (None if that never happens within the horizon)
        for t, b in enumerate(bands):
            if b in bad:
                return t - 1
        return None

    # Consecutive runs of the same band, e.g. low 0-2, medium 3-7, high 8-24
    segments = []
    for t, b in enumerate(bands):
        if segments and segments[-1]["band"] == b:
            segments[-1]["end_month"] = t
        else:
            segments.append({"band": b, "start_month": t, "end_month": t})

    # First month each band starts and last month it ends (None if it never occurs)
    band_ranges = {}
    for name in ("low", "medium", "high"):
        months = [t for t, b in enumerate(bands) if b == name]
        band_ranges[name] = (
            {"start_month": months[0], "end_month": months[-1]} if months else None
        )

    horizon = len(risk) - 1
    low_until = last_month_before({"medium", "high"})
    window = horizon if low_until is None else max(low_until, 0)
    return {
        "recommended_window_months": window,  # end of the low-risk band
        "low_threshold": low,
        "high_threshold": high,
        "bands": bands,  # band for each month 0..horizon
        "band_ranges": band_ranges,  # {"low": {"start_month", "end_month"}, ...}
        "band_segments": segments,  # same, in order; lists a band twice if risk dips back
        "risk_at_window": float(risk[window]),
        "risk_at_horizon": float(risk[-1]),
        "worst_state_at_horizon": float(dist[-1, -1]),
    }