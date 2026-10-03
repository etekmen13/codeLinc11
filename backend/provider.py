"""Provider comparison: filter dentists and price each one using the Monte Carlo output.

Input:  dist             (T+1, n) array from monte_carlo.run_simulation
        state_procedure  length-n list: procedure that treats each state (None = no cost)
        providers        list of dentist dicts (see EXAMPLE_PROVIDERS)
        plan             insurance rules dict (see EXAMPLE_PLAN)
Output: {"in_network": [cards], "out_of_network": [cards]}, each sorted by what you pay now.

Nothing here is specific to teeth or to 4 states: any n works, as long as
state_procedure has n entries and the procedure names match the fee/plan keys.
"""

import math

import numpy as np

# ---------------------------------------------------------------- example data
# Used only as parameter defaults. Matches monte_carlo's 4 example states.
EXAMPLE_STATE_PROCEDURE = ("filling", "crown", "root_canal", "extraction")
# "extraction" = pulling the tooth plus an implant to replace it (the costly end state)

EXAMPLE_PLAN = {
    "category": {  # which coverage category each procedure falls in
        "filling": "basic",
        "crown": "major",
        "root_canal": "major",
        "extraction": "major",
    },
    "coinsurance": {"preventive": 1.0, "basic": 0.8, "major": 0.5},  # share plan pays
    "deductible_remaining": 50,
    "annual_max_remaining": 300,
    "reset_in_months": 3,  # first reset happens after this many months
    "plan_year_months": 12,  # then it resets every 12 months
    "deductible_new": 50,  # at the start of each new plan year
    "annual_max_new": 1500,  # at the start of each new plan year
    "allowed_amounts": {  # what the plan counts for out-of-network dentists
        "filling": 150,
        "crown": 900,
        "root_canal": 1100,
        "extraction": 3200,
    },
}

EXAMPLE_USER_LOCATION = (35.2271, -80.8431)  # Charlotte, NC

EXAMPLE_PROVIDERS = (
    {"id": 1, "name": "Uptown Smiles", "lat": 35.2270, "lon": -80.8430, "in_network": True,
     "credentials": ["DDS"],
     "fees": {"filling": 180, "crown": 1100, "root_canal": 1300, "extraction": 3800}},
    {"id": 2, "name": "SouthPark Dental", "lat": 35.1500, "lon": -80.8300, "in_network": True,
     "credentials": ["DMD"],
     "fees": {"filling": 210, "crown": 1250, "root_canal": 1450, "extraction": 4200}},
    {"id": 3, "name": "NoDa Family Dentistry", "lat": 35.2470, "lon": -80.8020, "in_network": True,
     "credentials": ["DDS"],
     "fees": {"filling": 160, "crown": 1000, "extraction": 3600}},  # no root canals
    {"id": 4, "name": "Plaza Midwood Dental", "lat": 35.2200, "lon": -80.8100, "in_network": False,
     "credentials": ["DDS"],
     "fees": {"filling": 220, "crown": 1300, "root_canal": 1500, "extraction": 4500}},
    {"id": 5, "name": "Ballantyne Endodontics", "lat": 35.0500, "lon": -80.8500, "in_network": False,
     "credentials": ["DDS", "Endodontist"],
     "fees": {"filling": 250, "crown": 1400, "root_canal": 1600, "extraction": 4800}},
    {"id": 6, "name": "Dilworth Dental Care", "lat": 35.2000, "lon": -80.8450, "in_network": False,
     "credentials": ["DMD"],
     "fees": {"filling": 190, "crown": 1150, "root_canal": 1350, "extraction": 4000}},
    {"id": 7, "name": "University City Dental", "lat": 35.3070, "lon": -80.7350, "in_network": True,
     "credentials": ["DMD"],
     "fees": {"filling": 170, "crown": 1050, "root_canal": 1250, "extraction": 3700}},
)  # fmt: skip


# ---------------------------------------------------------------- pieces
def distance_miles(a, b):
    """Great-circle (haversine) distance between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def plan_year_at(plan, month):
    """Which plan year `month` falls in: 0 = current, 1 = next, 2 = the one after, ..."""
    first_reset = plan["reset_in_months"]
    if month < first_reset:
        return 0
    return 1 + (month - first_reset) // plan.get("plan_year_months", 12)


def plan_rules_at(plan, month):
    """Deductible and annual max that apply if treatment happens at `month`.

    Current year: whatever is left. Every later year: a fresh deductible and max.
    """
    if plan_year_at(plan, month) == 0:
        return plan["deductible_remaining"], plan["annual_max_remaining"]
    return plan["deductible_new"], plan["annual_max_new"]


def price(procedure, provider, plan, month=0):
    """What one procedure costs at one provider, if done at `month`."""
    if procedure is None:  # state needs no treatment
        return {"fee": 0.0, "plan_pays": 0.0, "you_pay": 0.0, "balance_bill": 0.0}
    fee = float(provider["fees"][procedure])
    if provider["in_network"]:
        counted = fee
    else:  # plan only counts up to its allowed amount; you owe the rest
        counted = min(fee, float(plan["allowed_amounts"][procedure]))
    c = plan["coinsurance"][plan["category"][procedure]]
    deductible, annual_max = plan_rules_at(plan, month)
    plan_pays = min(c * max(counted - deductible, 0.0), annual_max)
    return {
        "fee": fee,
        "plan_pays": plan_pays,
        "you_pay": fee - plan_pays,
        "balance_bill": fee - counted,
    }


def expected_price(dist_t, state_procedure, provider, plan, month):
    """Probability-weighted price over the states the tooth could be in at `month`."""
    out = {"fee": 0.0, "plan_pays": 0.0, "you_pay": 0.0, "balance_bill": 0.0}
    for s, p_s in enumerate(dist_t):
        if p_s == 0:
            continue
        cost = price(state_procedure[s], provider, plan, month)
        for k in out:
            out[k] += p_s * cost[k]
    return out


def needed_procedures(dist, state_procedure):
    """Procedures for every state that shows up in any simulated month."""
    possible = np.flatnonzero(np.asarray(dist).max(axis=0) > 0)
    return {state_procedure[s] for s in possible} - {None}


# ---------------------------------------------------------------- main entry
def compare_providers(
    dist,
    wait_month=None,
    state_procedure=EXAMPLE_STATE_PROCEDURE,
    providers=EXAMPLE_PROVIDERS,
    plan=EXAMPLE_PLAN,
    user_location=EXAMPLE_USER_LOCATION,
    radius_miles=25.0,
    credentials=None,
    bands=None,
):
    """Filter and price providers, checking every month 0..T for the cheapest one.

    dist:        (T+1, n) state distribution per month from run_simulation
    wait_month:  month to compare against "now" (e.g. recommended_window_months);
                 None = last month of the simulation
    credentials: list of acceptable credentials (any match); None = no filter
    bands:       optional per-month risk bands from outcome_summary(...)["bands"],
                 used to label the cheapest month's risk
    """
    dist = np.asarray(dist, dtype=float)
    if dist.ndim != 2 or dist.shape[1] != len(state_procedure):
        raise ValueError(
            f"dist has {dist.shape[-1]} states but state_procedure has {len(state_procedure)}"
        )
    horizon = dist.shape[0] - 1
    wait_month = horizon if wait_month is None else wait_month
    if not 0 <= wait_month <= horizon:
        raise ValueError(f"wait_month must be between 0 and {horizon}")
    if bands is not None and len(bands) != horizon + 1:
        raise ValueError(f"bands has {len(bands)} months but dist has {horizon + 1}")

    needed = needed_procedures(dist, state_procedure)
    columns = {"in_network": [], "out_of_network": []}

    for d in providers:
        miles = distance_miles(user_location, (d["lat"], d["lon"]))
        if miles > radius_miles:
            continue
        if credentials and not set(credentials) & set(d["credentials"]):
            continue
        if not needed <= d["fees"].keys():  # can't treat every state that might happen
            continue

        now = expected_price(dist[0], state_procedure, d, plan, 0)
        later = expected_price(dist[wait_month], state_procedure, d, plan, wait_month)
        by_month = [
            expected_price(dist[t], state_procedure, d, plan, t)["you_pay"]
            for t in range(horizon + 1)
        ]
        best = int(np.argmin(by_month))  # cheapest month across all T+1 months
        card = {
            "id": d["id"],
            "name": d["name"],
            "distance_miles": round(miles, 1),
            "credentials": d["credentials"],
            "in_network": d["in_network"],
            "now": now,  # fee, plan_pays, you_pay, balance_bill if treated today
            "wait_month": wait_month,
            "if_you_wait": later,  # same, expected, if treated at wait_month
            "savings_if_you_wait": now["you_pay"] - later["you_pay"],
            "best_month": best,
            "best_you_pay": by_month[best],
            "savings_at_best": now["you_pay"] - by_month[best],
            "risk_band_at_best": None if bands is None else bands[best],
            "you_pay_by_month": by_month,  # expected you_pay for months 0..T
            "plan_year_by_month": [plan_year_at(plan, t) for t in range(horizon + 1)],
        }
        columns["in_network" if d["in_network"] else "out_of_network"].append(card)

    for col in columns.values():
        col.sort(key=lambda c: c["now"]["you_pay"])
    return columns