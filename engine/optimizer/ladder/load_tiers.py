"""Criticality-tier metadata and unserved-energy penalties."""

from __future__ import annotations

from typing import Final

TIER1_PENALTY: Final[float] = 1000.0
TIER2_PENALTY: Final[float] = 100.0
TIER3_PENALTY: Final[float] = 10.0
TIER4_PENALTY: Final[float] = 1.0

TIER_PENALTIES: Final[dict[int, float]] = {
    1: TIER1_PENALTY,
    2: TIER2_PENALTY,
    3: TIER3_PENALTY,
    4: TIER4_PENALTY,
}

TIER_LOADS: Final[dict[int, tuple[str, ...]]] = {
    1: ("Clinics", "Water pumps", "Emergency communication"),
    2: ("Schools", "Street lighting"),
    3: ("Residential homes",),
    4: ("Shops", "EV charging", "Flexible loads"),
}

DIESEL_LITERS_PER_KWH: Final[float] = 0.27
DIESEL_KG_CO2_PER_KWH: Final[float] = 0.74
INTERVAL_HOURS: Final[float] = 1.0
INFINITE_RUNWAY_DAYS: Final[float] = 999.0
