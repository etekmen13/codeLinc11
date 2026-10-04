"""Find Providers: toy dentists, filtered by radius and procedure, in two columns
(in-network, out-of-network), each sorted by what the employee pays.

Uses the team's catalog types (Plan, MemberStatus, CDT codes). Pricing comes
from the Cost Engine, assumed to provide:

    cost_engine.get_cost(procedure_code, provider, plan, member)
      -> {procedure, provider, in_network, provider_fee, deductible_applied,
          plan_pays, you_pay, balance_billing, annual_maximum_remaining}

Main entry: find_providers(procedure_code, plan, member, ...)
"""

import math

from catalog import PROCEDURES_BY_CODE, MemberStatus, Plan
from cost_engine import get_cost

# ---------------------------------------------------------------- toy dentists
# fees are keyed by CDT code; a missing code means the dentist doesn't do it.
EXAMPLE_USER_LOCATION = (35.2271, -80.8431)  # Charlotte, NC

EXAMPLE_PROVIDERS = (
    {"id": 1, "name": "Uptown Smiles", "lat": 35.2270, "lon": -80.8430, "in_network": True,
     "credentials": ["DDS"],
     "fees": {"D1110": 115, "D1206": 35, "D2391": 190, "D3330": 1150, "D2740": 1250, "D7140": 210}},
    {"id": 2, "name": "SouthPark Dental", "lat": 35.1500, "lon": -80.8300, "in_network": True,
     "credentials": ["DMD"],
     "fees": {"D1110": 130, "D1206": 45, "D2391": 220, "D3330": 1300, "D2740": 1400, "D7140": 240}},
    {"id": 3, "name": "NoDa Family Dentistry", "lat": 35.2470, "lon": -80.8020, "in_network": True,
     "credentials": ["DDS"],
     "fees": {"D1110": 105, "D1206": 30, "D2391": 175, "D7140": 195}},  # no root canals or crowns
    {"id": 4, "name": "Plaza Midwood Dental", "lat": 35.2200, "lon": -80.8100, "in_network": False,
     "credentials": ["DDS"],
     "fees": {"D1110": 140, "D1206": 50, "D2391": 240, "D3330": 1400, "D2740": 1500, "D7140": 260}},
    {"id": 5, "name": "Ballantyne Endodontics", "lat": 35.0500, "lon": -80.8500, "in_network": False,
     "credentials": ["DDS", "Endodontist"],
     "fees": {"D3330": 1500, "D2740": 1450}},  # specialist
    {"id": 6, "name": "Dilworth Dental Care", "lat": 35.2000, "lon": -80.8450, "in_network": False,
     "credentials": ["DMD"],
     "fees": {"D1110": 125, "D1206": 40, "D2391": 210, "D3330": 1250, "D2740": 1350, "D7140": 230}},
    {"id": 7, "name": "University City Dental", "lat": 35.3070, "lon": -80.7350, "in_network": True,
     "credentials": ["DMD"],
     "fees": {"D1110": 110, "D1206": 35, "D2391": 180, "D3330": 1100, "D2740": 1200, "D7140": 200}},
)  # fmt: skip


# ---------------------------------------------------------------- helpers
def distance_miles(a, b):
    """Great-circle (haversine) distance between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 3958.8 * 2 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- main entry
def find_providers(
    procedure_code: str,
    plan: Plan,
    member: MemberStatus,
    providers=EXAMPLE_PROVIDERS,
    user_location=EXAMPLE_USER_LOCATION,
    radius_miles: float = 25.0,
) -> dict:
    """Dentists within `radius_miles` that do the procedure, in two columns,
    each sorted by what you pay (cheapest first)."""
    if procedure_code not in PROCEDURES_BY_CODE:
        raise ValueError(f"unknown procedure {procedure_code!r}")

    result = {"procedure": procedure_code, "in_network": [], "out_of_network": []}
    for d in providers:
        if procedure_code not in d["fees"]:  # doesn't do this procedure
            continue
        miles = distance_miles(user_location, (d["lat"], d["lon"]))
        if miles > radius_miles:  # too far
            continue
        card = {
            "id": d["id"],
            "name": d["name"],
            "distance_miles": round(miles, 1),
            "credentials": d["credentials"],
            "in_network": d["in_network"],
            "cost": get_cost(procedure_code, d, plan, member),
        }
        result["in_network" if d["in_network"] else "out_of_network"].append(card)

    for column in ("in_network", "out_of_network"):
        result[column].sort(key=lambda c: c["cost"]["you_pay"])
    return result