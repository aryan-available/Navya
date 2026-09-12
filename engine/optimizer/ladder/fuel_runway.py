"""Deterministic 24-hour diesel fuel runway projection."""

from __future__ import annotations

import math

from engine.optimizer.core.constraints import measured_soc_kwh, soc_bounds_kwh
from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.ladder.load_tiers import DIESEL_LITERS_PER_KWH, INFINITE_RUNWAY_DAYS
from engine.optimizer.models import (
    CommunityState,
    Demand,
    ForecastState,
    OptimizationConstraints,
    RunwayProjection,
)


def _daylight_factor(hour: int) -> float:
    """Repeatable solar shape: zero at night, peak at hour 12."""
    angle = (hour - 6) * math.pi / 12.0
    return max(0.0, math.sin(angle))


def _wind_factor(hour: int) -> float:
    """Repeatable mild diurnal wind shape."""
    return 0.7 + 0.3 * math.cos((hour - 3) * math.pi / 12.0)


def _demand_factor(hour: int, growth: float) -> float:
    """Evening-peak demand shape scaled by forecast growth."""
    evening = 1.0 + 0.35 * max(0.0, math.sin((hour - 12) * math.pi / 12.0))
    return growth * evening


def project_runway(
    state: CommunityState,
    demand: Demand,
    forecast: ForecastState,
    constraints: OptimizationConstraints,
) -> RunwayProjection:
    """Simulate 24 sequential hours with no randomness and return fuel runway."""
    min_soc, max_soc = soc_bounds_kwh(state, constraints)
    fuel = state.diesel_fuel_liters
    soc = measured_soc_kwh(state)
    daily_liters = 0.0
    peak_solar = max(state.solar_available_kw, forecast.solar_next_hour)
    peak_wind = max(state.wind_available_kw, forecast.wind_next_hour)

    for hour in range(24):
        hour_state = state.model_copy(
            update={
                "solar_available_kw": peak_solar * _daylight_factor(hour),
                "wind_available_kw": peak_wind * _wind_factor(hour),
                "battery_soc_kwh": soc,
                "diesel_fuel_liters": fuel,
            }
        )
        factor = _demand_factor(hour, forecast.demand_growth_factor)
        hour_demand = Demand(
            tier1_kw=demand.tier1_kw * factor,
            tier2_kw=demand.tier2_kw * factor,
            tier3_kw=demand.tier3_kw * factor,
            tier4_kw=demand.tier4_kw * factor,
        )
        plan = dispatch_optimizer(hour_state, hour_demand, forecast, constraints)
        used = min(fuel, plan.diesel_output * DIESEL_LITERS_PER_KWH)
        fuel = max(0.0, fuel - used)
        daily_liters += used
        soc = min(max_soc, max(min_soc, soc + plan.battery_charge - plan.battery_discharge))

    if daily_liters <= 1e-9:
        days = INFINITE_RUNWAY_DAYS
    else:
        days = state.diesel_fuel_liters / daily_liters

    return RunwayProjection(
        remaining_liters=fuel,
        daily_diesel_consumption=daily_liters,
        projected_days_remaining=days,
    )
