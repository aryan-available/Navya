"""
solar_profile.py

Produces a non-random-looking solar irradiance and photovoltaic output curve,
shaped by time-of-day, solar geometry, and season. This is the "ground truth" generator —
forecasting modules consume an estimated view of this curve.
"""

import math
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Peak clear-sky GHI roughly follows this by month for standard tropical/subtropical sites (W/m^2)
PEAK_GHI_BY_MONTH = {
    1: 550, 2: 650, 3: 780, 4: 880, 5: 950, 6: 1000,
    7: 980, 8: 920, 9: 820, 10: 700, 11: 580, 12: 500,
}
DAY_LENGTH_BY_MONTH = {  # Daylight hours approximate
    1: 10.0, 2: 10.8, 3: 11.9, 4: 13.1, 5: 14.0, 6: 14.5,
    7: 14.3, 8: 13.5, 9: 12.3, 10: 11.1, 11: 10.2, 12: 9.7,
}


def clear_sky_ghi(dt: datetime) -> float:
    """Bell-curve GHI centered on solar noon, zero outside daylight hours."""
    month = dt.month
    peak = PEAK_GHI_BY_MONTH.get(month, 800)
    day_len = DAY_LENGTH_BY_MONTH.get(month, 12.0)
    sunrise = 12.0 - day_len / 2.0
    sunset = 12.0 + day_len / 2.0

    hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
    if hour <= sunrise or hour >= sunset:
        return 0.0

    # Map daylight window to 0..pi so sin() gives a smooth sunrise->noon->sunset curve
    frac = (hour - sunrise) / (sunset - sunrise)
    return peak * math.sin(frac * math.pi)


def get_irradiance(dt: datetime, cloud_cover_pct: float = 0.0, jitter: bool = True) -> float:
    """
    Returns Global Horizontal Irradiance (GHI) in W/m^2 at given datetime.
    cloud_cover_pct: 0-100, attenuates output (used by scenario_injector).
    """
    base = clear_sky_ghi(dt)
    if base <= 0.0:
        return 0.0

    # Cloud attenuation: diffuse radiation still reaches panels even under overcast skies
    attenuation = 1.0 - (min(100.0, max(0.0, cloud_cover_pct)) / 100.0) * 0.85
    value = base * attenuation

    if jitter and value > 0:
        # Subtle physical variation (atmospheric haze, aerosol fluctuations)
        value *= random.uniform(0.96, 1.04)

    return max(0.0, round(value, 1))


def get_panel_output_kw(dt: datetime, array_capacity_kw: float = 100.0,
                         cloud_cover_pct: float = 0.0,
                         panel_efficiency: float = 0.20,
                         jitter: bool = True) -> float:
    """
    Converts irradiance to electrical generation in kW, capped at nameplate capacity.
    Uses 1000 W/m^2 standard test conditions (STC) reference irradiance.
    """
    ghi = get_irradiance(dt, cloud_cover_pct, jitter=jitter)
    fraction_of_rated = min(1.0, ghi / 1000.0)
    eff_ratio = panel_efficiency / 0.20
    output = array_capacity_kw * fraction_of_rated * eff_ratio
    return round(min(array_capacity_kw, max(0.0, output)), 2)


def generate_series(start: datetime, hours: int = 24, step_minutes: int = 15,
                    array_capacity_kw: float = 100.0,
                    cloud_cover_pct: float = 0.0) -> List[Dict[str, Any]]:
    """Time-series generator of solar generation for simulation and timeline displays."""
    points = []
    steps = int((hours * 60) / step_minutes)
    for i in range(steps + 1):
        dt = start + timedelta(minutes=i * step_minutes)
        ghi = get_irradiance(dt, cloud_cover_pct, jitter=True)
        out = get_panel_output_kw(dt, array_capacity_kw, cloud_cover_pct, jitter=True)
        points.append({
            "timestamp": dt.isoformat(),
            "ghi_w_m2": ghi,
            "output_kw": out
        })
    return points


if __name__ == "__main__":
    test_now = datetime(2026, 6, 21, 6, 0)
    for p in generate_series(test_now, hours=16, step_minutes=60, array_capacity_kw=100.0):
        print(f"{p['timestamp']} -> GHI: {p['ghi_w_m2']} W/m^2, Output: {p['output_kw']} kW")
