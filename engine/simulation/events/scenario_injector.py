"""
scenario_injector.py

Implements What-If scenario triggers matching the product specification:
1. cloud_cover: Sudden cloud cover attenuating PV output
2. wind_drop: Abrupt atmospheric wind cessation
3. demand_surge: Community demand spike (overall or specific tier e.g. EV rush)
4. battery_failure: BESS inverter or cell bank shutdown
5. diesel_price_spike: Economic fuel price escalation

Each trigger returns a standardized ScenarioEvent carrying structured metadata
ready for consumer modules (optimizer, simulator, live push).
"""

import sys
import os
from datetime import datetime
from typing import Dict, Any, Optional

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from shared.schemas.simulation_models import ScenarioEvent
except ImportError:
    from shared_schemas import ScenarioEvent

VALID_SCENARIOS = {
    "cloud_cover",
    "wind_drop",
    "demand_surge",
    "battery_failure",
    "diesel_price_spike",
}


def _create_event(name: str,
                  dt: Optional[datetime],
                  magnitude: float,
                  duration_hours: float,
                  metadata: Optional[Dict[str, Any]] = None) -> ScenarioEvent:
    event_dt = dt or datetime.now()
    return ScenarioEvent(
        name=name,
        triggered_at=event_dt.isoformat(),
        magnitude=round(magnitude, 2),
        duration_hours=round(duration_hours, 1),
        metadata=metadata or {},
    )


def trigger_cloud_cover(dt: Optional[datetime] = None,
                        severity_pct: float = 70.0,
                        duration_hours: float = 3.0) -> ScenarioEvent:
    """
    severity_pct: 0 to 100 percentage of cloud cover attenuation.
    Passed directly to solar_profile.get_irradiance().
    """
    clamped_pct = max(0.0, min(100.0, severity_pct))
    return _create_event(
        name="cloud_cover",
        dt=dt,
        magnitude=clamped_pct / 100.0,
        duration_hours=duration_hours,
        metadata={"cloud_cover_pct": clamped_pct}
    )


def trigger_wind_drop(dt: Optional[datetime] = None,
                      severity: float = 0.60,
                      duration_hours: float = 4.0) -> ScenarioEvent:
    """
    severity: fraction by which wind is reduced (0.60 = speed cut by 60% -> 40% remains).
    """
    clamped_sev = max(0.0, min(1.0, severity))
    speed_multiplier = round(1.0 - clamped_sev, 2)
    return _create_event(
        name="wind_drop",
        dt=dt,
        magnitude=clamped_sev,
        duration_hours=duration_hours,
        metadata={"speed_multiplier": speed_multiplier}
    )


def trigger_demand_surge(dt: Optional[datetime] = None,
                         severity: float = 0.50,
                         duration_hours: float = 2.0,
                         tier: Optional[int] = None) -> ScenarioEvent:
    """
    severity: fractional demand increase (0.50 = +50% surge).
    tier: optional LoadTier filter (e.g. 4 for EV charging spike). None = whole community.
    """
    clamped_sev = max(0.0, min(5.0, severity))
    multiplier = round(1.0 + clamped_sev, 2)
    meta = {"multiplier": multiplier, "tier": int(tier) if tier is not None else None}
    return _create_event(
        name="demand_surge",
        dt=dt,
        magnitude=clamped_sev,
        duration_hours=duration_hours,
        metadata=meta
    )


def trigger_battery_failure(dt: Optional[datetime] = None,
                            severity: float = 1.0,
                            duration_hours: float = 6.0) -> ScenarioEvent:
    """
    severity: fraction of battery capacity offline (1.0 = total blackout/trip of BESS).
    """
    clamped_sev = max(0.0, min(1.0, severity))
    avail_fraction = round(max(0.0, 1.0 - clamped_sev), 2)
    return _create_event(
        name="battery_failure",
        dt=dt,
        magnitude=clamped_sev,
        duration_hours=duration_hours,
        metadata={"available_capacity_fraction": avail_fraction}
    )


def trigger_diesel_price_spike(dt: Optional[datetime] = None,
                               severity: float = 0.80,
                               duration_hours: float = 48.0) -> ScenarioEvent:
    """
    severity: fractional price increase (0.80 = +80% fuel cost).
    Adjusts the economic objective penalty in the optimization model.
    """
    clamped_sev = max(0.0, min(10.0, severity))
    price_multiplier = round(1.0 + clamped_sev, 2)
    return _create_event(
        name="diesel_price_spike",
        dt=dt,
        magnitude=clamped_sev,
        duration_hours=duration_hours,
        metadata={"price_multiplier": price_multiplier}
    )


DISPATCH = {
    "cloud_cover": lambda **kw: trigger_cloud_cover(
        severity_pct=kw.get("severity", kw.get("severity_pct", 70.0)),
        duration_hours=kw.get("duration_hours", 3.0),
        dt=kw.get("dt")
    ),
    "wind_drop": lambda **kw: trigger_wind_drop(
        severity=kw.get("severity", 0.60),
        duration_hours=kw.get("duration_hours", 4.0),
        dt=kw.get("dt")
    ),
    "demand_surge": lambda **kw: trigger_demand_surge(
        severity=kw.get("severity", 0.50),
        duration_hours=kw.get("duration_hours", 2.0),
        tier=kw.get("tier"),
        dt=kw.get("dt")
    ),
    "battery_failure": lambda **kw: trigger_battery_failure(
        severity=kw.get("severity", 1.0),
        duration_hours=kw.get("duration_hours", 6.0),
        dt=kw.get("dt")
    ),
    "diesel_price_spike": lambda **kw: trigger_diesel_price_spike(
        severity=kw.get("severity", 0.80),
        duration_hours=kw.get("duration_hours", 48.0),
        dt=kw.get("dt")
    ),
}


def trigger(name: str, **kwargs) -> ScenarioEvent:
    """Universal dispatcher for scenario events."""
    if name not in VALID_SCENARIOS:
        raise ValueError(f"Unknown scenario '{name}'. Must be one of: {sorted(VALID_SCENARIOS)}")
    return DISPATCH[name](**kwargs)


if __name__ == "__main__":
    for sc in VALID_SCENARIOS:
        ev = trigger(sc)
        print(f"Triggered: {ev.name} | Mag: {ev.magnitude} | Dur: {ev.duration_hours}h | Meta: {ev.metadata}")
