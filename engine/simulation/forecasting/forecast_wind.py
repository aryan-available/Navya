"""
forecast_wind.py

Weather Forecast Agent (Wind turbine generation).
Generates forward 24h to 72h projections for atmospheric wind speed and turbine kW.
Wind exhibits higher chaos / lower predictability than solar, so forecast
confidence degrades faster (from ~0.90 down to ~0.45 at 72h).
"""

import sys
import os
from datetime import datetime, timedelta

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from generators import wind_profile
try:
    from shared.schemas.simulation_models import WeatherForecast
except ImportError:
    from shared_schemas import WeatherForecast


def forecast(start_dt: datetime,
             horizon_hours: int = 72,
             step_minutes: int = 60,
             rated_capacity_kw: float = 30.0,
             speed_multiplier: float = 1.0) -> WeatherForecast:
    """
    Computes wind velocity and generation forecast.
    Seeds state once at initial timestep to produce a single continuous physical path.
    """
    points = []
    confidences = []
    total_steps = int((horizon_hours * 60) / step_minutes)

    # Initialize continuity seed
    wind_profile.get_wind_speed(start_dt, speed_multiplier=speed_multiplier, reset=True)

    for i in range(total_steps + 1):
        dt = start_dt + timedelta(minutes=i * step_minutes)
        hours_ahead = (i * step_minutes) / 60.0

        speed = wind_profile.get_wind_speed(dt, speed_multiplier=speed_multiplier)
        output_kw = wind_profile.get_turbine_output_kw(speed, rated_capacity_kw)

        points.append({
            "timestamp": dt.isoformat(),
            "wind_speed_m_s": speed,
            "output_kw": output_kw,
        })

        # Wind confidence: degrades from 0.90 to 0.45 over horizon
        decay_factor = min(1.0, hours_ahead / max(1.0, float(horizon_hours)))
        confidence = max(0.45, 0.90 - decay_factor * 0.45)
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
        print(f"  {pt['timestamp']} | Speed: {pt['wind_speed_m_s']:4.1f} m/s | Output: {pt['output_kw']:5.1f} kW | Conf: {conf}")
