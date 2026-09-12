"""
forecast_demand.py

Demand Forecast Agent for off-grid community loads.
Projects future demand broken down by LoadTier (1=Critical, 2=Important, 3=Homes, 4=Flexible).
Because human activities follow structured daily routines, demand confidence remains
high (from ~0.97 to ~0.70 at 72h).
Supplies the data consumed by Stage 0 (Early Warning, 6-12h ahead) of the Shortfall Ladder.
"""

import sys
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple, Optional

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from generators import demand_profile
try:
    from shared.schemas.simulation_models import LoadTier, DemandForecast
except ImportError:
    from shared_schemas import LoadTier, DemandForecast


def forecast(start_dt: datetime,
             horizon_hours: int = 72,
             step_minutes: int = 60,
             demand_multiplier: float = 1.0,
             target_tier: Optional[int] = None) -> Dict[str, Any]:
    """
    Returns forward community demand projection:
    {
        "generated_at": ISO8601,
        "horizon_hours": int,
        "points": [
            {
                "timestamp": ISO8601,
                "total_kw": float,
                "by_tier": {1: float, 2: float, 3: float, 4: float}
            }, ...
        ],
        "confidence": [float, ...]
    }
    """
    points = []
    confidences = []
    total_steps = int((horizon_hours * 60) / step_minutes)

    for i in range(total_steps + 1):
        dt = start_dt + timedelta(minutes=i * step_minutes)
        hours_ahead = (i * step_minutes) / 60.0

        # Deterministic expectation (no jitter in forecast trajectory)
        by_tier = demand_profile.get_demand_by_tier(
            dt,
            demand_multiplier=demand_multiplier,
            target_tier=target_tier,
            jitter=False
        )
        total_kw = round(sum(by_tier.values()), 2)

        points.append({
            "timestamp": dt.isoformat(),
            "total_kw": total_kw,
            "by_tier": {int(t): kw for t, kw in by_tier.items()},
        })

        # Demand confidence decays from 0.97 to 0.70
        decay_factor = min(1.0, hours_ahead / max(1.0, float(horizon_hours)))
        confidence = max(0.70, 0.97 - decay_factor * 0.27)
        confidences.append(round(confidence, 2))

    return {
        "generated_at": start_dt.isoformat(),
        "horizon_hours": horizon_hours,
        "points": points,
        "confidence": confidences,
    }


def flag_early_warning(current_supply_forecast_kw: List[float],
                       demand_forecast: Dict[str, Any],
                       lookahead_hours: Tuple[float, float] = (6.0, 12.0),
                       step_minutes: int = 60) -> bool:
    """
    Stage 0 Early Warning check: detects potential supply shortfall 6-12h ahead.
    Compares supply array against demand forecast points within the lookahead window.
    Returns True if projected demand exceeds available renewable/battery supply.
    """
    points = demand_forecast["points"]
    if len(current_supply_forecast_kw) != len(points):
        raise ValueError("current_supply_forecast_kw length must match demand_forecast points length")

    min_h, max_h = lookahead_hours
    for idx, point in enumerate(points):
        hours_ahead = (idx * step_minutes) / 60.0
        if min_h <= hours_ahead <= max_h:
            supply = current_supply_forecast_kw[idx]
            demand = point["total_kw"]
            if demand > supply:
                return True
    return False


forecast.forecast = forecast

if __name__ == "__main__":
    from datetime import datetime
    fc = forecast(datetime(2026, 6, 21, 0, 0), horizon_hours=24, step_minutes=180)
    print(f"Generated at: {fc['generated_at']} | Points: {len(fc['points'])}")
    for pt, conf in zip(fc["points"], fc["confidence"]):
        print(f"  {pt['timestamp']} | Total: {pt['total_kw']:5.1f} kW | Tier 1: {pt['by_tier'][1]:4.1f} kW | Conf: {conf}")
