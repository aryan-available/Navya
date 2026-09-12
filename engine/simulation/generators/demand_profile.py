"""
demand_profile.py

Simulates realistic off-grid community electrical demand across 9 named load blocks,
each assigned to a LoadTier (1=Critical, 2=Important, 3=Homes, 4=Flexible).
This per-tier tagging enables Member C's Shortfall Ladder to shed or hold loads
in strictly prioritized order.
"""

import math
import random
import sys
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

# Ensure shared_schemas is accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from shared.schemas.simulation_models import LoadTier, DemandPoint
except ImportError:
    from shared_schemas import LoadTier, DemandPoint

# Community load blocks: (label, tier, base_kw, peak_hour, peak_multiplier)
LOAD_BLOCKS = [
    ("clinic", LoadTier.CRITICAL, 8.0, None, None),          # Flat critical 24/7 load
    ("water_pump_station", LoadTier.CRITICAL, 5.0, 7.0, 1.6), # Morning pumping cycle
    ("school", LoadTier.IMPORTANT, 6.0, 10.0, 1.8),          # Mid-morning school activity
    ("street_lighting", LoadTier.IMPORTANT, 3.0, 20.0, 2.2), # Evening/night illumination
    ("household_block_1", LoadTier.HOMES, 10.0, 19.0, 2.0),  # Evening residential peak
    ("household_block_2", LoadTier.HOMES, 10.0, 19.0, 2.0),
    ("household_block_3", LoadTier.HOMES, 9.0, 20.0, 2.1),
    ("small_industry", LoadTier.FLEXIBLE, 12.0, 13.0, 1.7),  # Daytime workshops / milling
    ("ev_charger_bank", LoadTier.FLEXIBLE, 6.0, 22.0, 2.5),  # Night charging / deferrable
]


def daily_shape(hour: float, peak_hour: Optional[float], peak_multiplier: Optional[float]) -> float:
    """Calculates diurnal variation for each load block with periodic Gaussian envelope."""
    if peak_hour is None or peak_multiplier is None:
        return 1.0  # Constant baseload

    diff = min(abs(hour - peak_hour), 24.0 - abs(hour - peak_hour))
    # Gaussian distribution with 3-hour dispersion
    bump = math.exp(-(diff ** 2) / (2.0 * (3.0 ** 2)))
    return 1.0 + (peak_multiplier - 1.0) * bump


def get_demand_at(dt: datetime,
                  demand_multiplier: float = 1.0,
                  target_tier: Optional[int] = None,
                  jitter: bool = True) -> List[DemandPoint]:
    """
    Returns list of DemandPoint objects for all load blocks at the given datetime.
    demand_multiplier: applied across all tiers or scoped to target_tier.
    """
    hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
    points = []

    for label, tier, base_kw, peak_hour, peak_mult in LOAD_BLOCKS:
        shape = daily_shape(hour, peak_hour, peak_mult)
        load = base_kw * shape

        # Apply multiplier if tier matches or universal
        if target_tier is None or int(tier) == int(target_tier):
            load *= demand_multiplier

        if jitter:
            load *= random.uniform(0.96, 1.04)

        points.append(DemandPoint(
            timestamp=dt.isoformat(),
            tier=tier,
            load_kw=round(max(0.1, load), 2),
            label=label,
        ))

    return points


def get_total_demand_kw(dt: datetime,
                         demand_multiplier: float = 1.0,
                         target_tier: Optional[int] = None,
                         jitter: bool = True) -> float:
    """Returns aggregated microgrid demand in kW."""
    points = get_demand_at(dt, demand_multiplier, target_tier, jitter)
    return round(sum(p.load_kw for p in points), 2)


def get_demand_by_tier(dt: datetime,
                       demand_multiplier: float = 1.0,
                       target_tier: Optional[int] = None,
                       jitter: bool = True) -> Dict[int, float]:
    """
    Returns {tier_int: total_kw} mapping.
    Crucial input for Member C Shortfall Response Ladder stages 0-4.
    """
    totals = {int(tier): 0.0 for tier in LoadTier}
    points = get_demand_at(dt, demand_multiplier, target_tier, jitter)
    for p in points:
        totals[int(p.tier)] += p.load_kw
    return {tier: round(kw, 2) for tier, kw in totals.items()}


def generate_series(start: datetime, hours: int = 24, step_minutes: int = 15,
                    demand_multiplier: float = 1.0,
                    target_tier: Optional[int] = None) -> List[Dict[str, Any]]:
    """Generates time series for demand forecast and timeline displays."""
    series = []
    steps = int((hours * 60) / step_minutes)
    for i in range(steps + 1):
        dt = start + timedelta(minutes=i * step_minutes)
        blocks = get_demand_at(dt, demand_multiplier, target_tier, jitter=True)
        tot = round(sum(b.load_kw for b in blocks), 2)
        by_t = {int(t): round(sum(b.load_kw for b in blocks if b.tier == t), 2) for t in LoadTier}
        series.append({
            "timestamp": dt.isoformat(),
            "total_kw": tot,
            "by_tier": by_t,
            "blocks": [{"label": b.label, "tier": int(b.tier), "load_kw": b.load_kw} for b in blocks]
        })
    return series


if __name__ == "__main__":
    test_now = datetime(2026, 6, 21, 0, 0)
    for row in generate_series(test_now, hours=24, step_minutes=180):
        print(f"{row['timestamp']} -> Total: {row['total_kw']} kW | Tiers: {row['by_tier']}")
