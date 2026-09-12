"""
forecast_solar.py

Weather Forecast Agent (Solar photovoltaic generation).
Generates forward 24h to 72h projections for GHI and PV output kW.
Confidence decays smoothly with projection horizon (from ~0.95 down to ~0.55).
Feeds Member C's dispatch optimizer and Stage 0 (Early Warning) of the Shortfall Ladder.
"""

import sys
import os
from datetime import datetime, timedelta
from typing import Optional

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from generators import solar_profile
try:
    from shared.schemas.simulation_models import WeatherForecast
except ImportError:
    from shared_schemas import WeatherForecast


def forecast(start_dt: datetime,
             horizon_hours: int = 72,
             step_minutes: int = 60,
             array_capacity_kw: float = 100.0,
             cloud_cover_pct: float = 0.0) -> WeatherForecast:
    """
    Computes solar forecast trajectory over horizon_hours.
    Confidence score reflects empirical meteorological forecasting skill.
    """
    points = []
    confidences = []
    total_steps = int((horizon_hours * 60) / step_minutes)

    for i in range(total_steps + 1):
        dt = start_dt + timedelta(minutes=i * step_minutes)
        hours_ahead = (i * step_minutes) / 60.0

        # Deterministic expected trajectory (no noise in forecast curve)
        ghi = solar_profile.get_irradiance(dt, cloud_cover_pct=cloud_cover_pct, jitter=False)
        output_kw = solar_profile.get_panel_output_kw(
            dt,
            array_capacity_kw=array_capacity_kw,
            cloud_cover_pct=cloud_cover_pct,
            jitter=False
        )

        points.append({
            "timestamp": dt.isoformat(),
            "ghi_w_m2": ghi,
            "output_kw": output_kw,
        })

        # Confidence: starts at 0.95, degrades linearly to 0.55 at edge of horizon
        decay_factor = min(1.0, hours_ahead / max(1.0, float(horizon_hours)))
        confidence = max(0.55, 0.95 - decay_factor * 0.40)
        confidences.append(round(confidence, 2))

    return WeatherForecast(
        generated_at=start_dt.isoformat(),
        horizon_hours=horizon_hours,
        points=points,
        confidence=confidences,
    )


forecast.forecast = forecast

if __name__ == "__main__":
    from datetime import datetime
    fc = forecast(datetime(2026, 6, 21, 0, 0), horizon_hours=24, step_minutes=180)
    print(f"Generated at: {fc.generated_at} | Points: {len(fc.points)}")
    for pt, conf in zip(fc.points, fc.confidence):
        print(f"  {pt['timestamp']} | GHI: {pt['ghi_w_m2']:5.1f} W/m^2 | Output: {pt['output_kw']:5.1f} kW | Conf: {conf}")
