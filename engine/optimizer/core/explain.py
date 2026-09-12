"""Structured reason codes for a solved dispatch plan. No prose."""

from __future__ import annotations

from engine.optimizer.core.constraints import (
    diesel_energy_cap_kwh,
    measured_soc_kwh,
    soc_bounds_kwh,
)
from engine.optimizer.models import CommunityState, Demand, DispatchPlan, OptimizationConstraints

_EPS = 1e-3


def explain(
    plan: DispatchPlan,
    state: CommunityState,
    demand: Demand,
    constraints: OptimizationConstraints,
) -> list[str]:
    """Return ordered reason codes describing the solved dispatch."""
    codes: list[str] = []
    min_soc, max_soc = soc_bounds_kwh(state, constraints)
    next_soc = measured_soc_kwh(state) + plan.battery_charge - plan.battery_discharge
    diesel_cap = diesel_energy_cap_kwh(state)
    unserved = (
        plan.unserved_tier1
        + plan.unserved_tier2
        + plan.unserved_tier3
        + plan.unserved_tier4
    )

    if state.solar_available_kw > _EPS and plan.solar_used >= state.solar_available_kw - _EPS:
        codes.append("MAX_SOLAR_USED")
    if state.wind_available_kw > _EPS and plan.wind_used >= state.wind_available_kw - _EPS:
        codes.append("MAX_WIND_USED")
    if plan.diesel_output > _EPS:
        codes.append("DIESEL_STARTED")
    if state.diesel_fuel_liters < 20.0 or diesel_cap < state.diesel_max_kw * 0.25:
        codes.append("LOW_FUEL_CONSERVATION")
    if next_soc <= min_soc + _EPS and plan.battery_discharge <= _EPS:
        codes.append("BATTERY_PROTECTED")
    if next_soc >= max_soc - _EPS and plan.battery_charge <= _EPS and state.battery_soc_kwh >= max_soc - _EPS:
        codes.append("BATTERY_PROTECTED")
    if plan.unserved_tier4 > _EPS and plan.unserved_tier1 <= _EPS:
        codes.append("TIER4_SHED_FIRST")
    if abs(unserved) <= _EPS:
        codes.append("FULL_DEMAND_SERVED")
    codes.append("GRID_BALANCED")
    return codes
