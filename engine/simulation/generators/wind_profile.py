"""
wind_profile.py

Wind speed profile generator with diurnal atmospheric tendencies and slow-moving
weather fronts modeled as an autocorrelated random walk.
Includes a standard cubic ramp turbine power curve to calculate electrical kW output.
"""

import math
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Turbine power curve thresholds for typical community-scale wind turbines
CUT_IN_MS = 3.0
RATED_MS = 12.0
CUT_OUT_MS = 25.0

# Module-level state tracking for autocorrelated wind velocity persistence
_STATE = {"last_speed": 6.0}


def diurnal_base(dt: datetime) -> float:
    """Atmospheric thermal winds typically strengthen during afternoon hours."""
    hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
    return 5.5 + 2.0 * math.sin((hour - 14.0) / 24.0 * 2.0 * math.pi)


def get_wind_speed(dt: datetime, speed_multiplier: float = 1.0, reset: bool = False) -> float:
    """
    Returns wind speed in m/s using a bounded random walk around diurnal base.
    speed_multiplier: used by scenario_injector to simulate wind drop / calm periods.
    """
    base = diurnal_base(dt) * speed_multiplier
    if reset:
        _STATE["last_speed"] = base

    # Pull prior speed toward diurnal base with bounded stochastic step
    pulled = _STATE["last_speed"] * 0.85 + base * 0.15
    step = random.uniform(-0.6, 0.6)
    speed = max(0.0, pulled + step)
    _STATE["last_speed"] = speed
    return round(speed, 2)


def get_turbine_output_kw(wind_speed_m_s: float, rated_capacity_kw: float = 30.0) -> float:
    """
    Standard aerodynamic wind turbine power curve:
    - Below cut-in (3 m/s): 0 kW
    - Cut-in to rated (3 to 12 m/s): cubic power ramp ~ (v - v_in)^3
    - Rated to cut-out (12 to 25 m/s): rated nameplate capacity
    - Above cut-out (>= 25 m/s): 0 kW (safety brake/feather)
    """
    if wind_speed_m_s < CUT_IN_MS or wind_speed_m_s >= CUT_OUT_MS:
        return 0.0
    if wind_speed_m_s >= RATED_MS:
        return rated_capacity_kw

    # Cubic ramp
    fraction = ((wind_speed_m_s - CUT_IN_MS) / (RATED_MS - CUT_IN_MS)) ** 3
    output = rated_capacity_kw * fraction
    return round(min(rated_capacity_kw, max(0.0, output)), 2)


def generate_series(start: datetime, hours: int = 24, step_minutes: int = 15,
                    rated_capacity_kw: float = 30.0,
                    speed_multiplier: float = 1.0) -> List[Dict[str, Any]]:
    """Time-series generator for wind speed and turbine generation."""
    points = []
    steps = int((hours * 60) / step_minutes)
    for i in range(steps + 1):
        dt = start + timedelta(minutes=i * step_minutes)
        speed = get_wind_speed(dt, speed_multiplier=speed_multiplier, reset=(i == 0))
        out = get_turbine_output_kw(speed, rated_capacity_kw)
        points.append({
            "timestamp": dt.isoformat(),
            "wind_speed_m_s": speed,
            "output_kw": out
        })
    return points


if __name__ == "__main__":
    test_now = datetime(2026, 6, 21, 0, 0)
    for p in generate_series(test_now, hours=12, step_minutes=60, rated_capacity_kw=30.0):
        print(f"{p['timestamp']} -> Speed: {p['wind_speed_m_s']} m/s, Output: {p['output_kw']} kW")
