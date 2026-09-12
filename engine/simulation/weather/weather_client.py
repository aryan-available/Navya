"""
weather_client.py

Client interface for live meteorological data via the Open-Meteo REST API
(free tier, zero authentication key needed).
Implements resilient graceful fallback to synthetic generators upon any network timeout,
DNS resolution failure, or offline demonstration environment.
Always explicitly labels the data provenance in WeatherState.source ("live" | "synthetic").
"""

import sys
import os
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from generators import solar_profile, wind_profile
try:
    from shared.schemas.simulation_models import WeatherState
except ImportError:
    from shared_schemas import WeatherState

DEFAULT_LAT = 18.5204  # Pune, Maharashtra, India
DEFAULT_LON = 73.8567

OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude={lat}&longitude={lon}"
    "&current=temperature_2m,cloud_cover,wind_speed_10m,shortwave_radiation"
    "&timezone=auto"
)


def _fetch_open_meteo(lat: float, lon: float, timeout_s: float = 3.0) -> dict:
    url = OPEN_METEO_URL.format(lat=lat, lon=lon)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "GridPilot-Simulation/1.0 (OffGridMicrogridOptimizer)"}
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        return json.loads(response.read().decode("utf-8"))


def get_current_weather(lat: float = DEFAULT_LAT,
                        lon: float = DEFAULT_LON,
                        use_live: bool = True,
                        cloud_cover_override: Optional[float] = None,
                        wind_multiplier: float = 1.0) -> WeatherState:
    """
    Returns current WeatherState.
    If use_live=True, queries Open-Meteo.
    If network is unavailable or times out, seamlessly falls back to synthetic models.
    """
    now = datetime.now()

    if use_live:
        try:
            data = _fetch_open_meteo(lat, lon)
            current = data.get("current", {})
            ghi = float(current.get("shortwave_radiation", 0.0) or 0.0)
            speed = float(current.get("wind_speed_10m", 0.0) or 0.0)
            temp = float(current.get("temperature_2m", 25.0) or 25.0)
            clouds = float(current.get("cloud_cover", 0.0) or 0.0)

            # Apply overrides if scenario is active
            if cloud_cover_override is not None:
                clouds = cloud_cover_override
            if wind_multiplier != 1.0:
                speed *= wind_multiplier

            return WeatherState(
                timestamp=now.isoformat(),
                ghi_w_m2=round(max(0.0, ghi), 1),
                wind_speed_m_s=round(max(0.0, speed), 2),
                temperature_c=round(temp, 1),
                cloud_cover_pct=round(max(0.0, min(100.0, clouds)), 1),
                source="live"
            )
        except Exception:
            # Fallback seamlessly to synthetic model
            pass

    # Synthetic atmospheric computation
    clouds = cloud_cover_override if cloud_cover_override is not None else 10.0
    ghi = solar_profile.get_irradiance(now, cloud_cover_pct=clouds, jitter=True)
    speed = wind_profile.get_wind_speed(now, speed_multiplier=wind_multiplier)

    # Plausible ambient temperature diurnal cycle (cooler at night, warmer at 2pm)
    hour = now.hour + now.minute / 60.0
    temp = 24.0 + 6.0 * solar_profile.math.sin((hour - 8.0) / 24.0 * 2.0 * solar_profile.math.pi)

    return WeatherState(
        timestamp=now.isoformat(),
        ghi_w_m2=round(ghi, 1),
        wind_speed_m_s=round(speed, 2),
        temperature_c=round(temp, 1),
        cloud_cover_pct=round(clouds, 1),
        source="synthetic"
    )


if __name__ == "__main__":
    w_live = get_current_weather(use_live=True)
    print(f"Weather (attempt live): Source={w_live.source} | GHI={w_live.ghi_w_m2} W/m^2 | Wind={w_live.wind_speed_m_s} m/s | Temp={w_live.temperature_c} C | Clouds={w_live.cloud_cover_pct}%")

    w_synth = get_current_weather(use_live=False)
    print(f"Weather (forced synthetic): Source={w_synth.source} | GHI={w_synth.ghi_w_m2} W/m^2 | Wind={w_synth.wind_speed_m_s} m/s | Temp={w_synth.temperature_c} C | Clouds={w_synth.cloud_cover_pct}%")
