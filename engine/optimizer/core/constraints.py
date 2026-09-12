"""Modular PuLP constraints for generation, battery, and energy balance."""

from __future__ import annotations

from typing import Any

from pulp import LpProblem, lpSum

from engine.optimizer.ladder.load_tiers import DIESEL_LITERS_PER_KWH, INTERVAL_HOURS
from engine.optimizer.models import CommunityState, Demand, OptimizationConstraints


def _soc_limit_to_kwh(value: float, capacity: float) -> float:
    """Convert a min/max SOC input to kWh.

    Accepts fraction of capacity (0–1], percent (1–100], or already-kWh values.
    """
    if value < 0.0:
        return 0.0
    if value <= 1.0:
        return value * capacity
    if value <= 100.0:
        return (value / 100.0) * capacity
    return value


def measured_soc_kwh(state: CommunityState) -> float:
    """Return battery energy in kWh, accepting kWh or percent-of-capacity inputs."""
    capacity = state.battery_capacity_kwh
    soc = state.battery_soc_kwh
    if capacity <= 0.0:
        return 0.0
    if soc < 0.0:
        return 0.0
    if soc > capacity and soc <= 100.0:
        return (soc / 100.0) * capacity
    return min(soc, capacity)


def soc_bounds_kwh(
    state: CommunityState,
    constraints: OptimizationConstraints,
) -> tuple[float, float]:
    """Return (min_soc_kwh, max_soc_kwh) with percent/fraction/kWh inputs."""
    capacity = state.battery_capacity_kwh
    min_soc = _soc_limit_to_kwh(constraints.battery_min_soc, capacity)
    max_soc = _soc_limit_to_kwh(constraints.battery_max_soc, capacity)
    min_soc = max(0.0, min(min_soc, capacity))
    max_soc = max(min_soc, min(max_soc, capacity))
    return min_soc, max_soc


def feasible_soc_window_kwh(
    state: CommunityState,
    constraints: OptimizationConstraints,
) -> tuple[float, float, float]:
    """Return (soc_kwh, next_min_kwh, next_max_kwh) reachable this interval.

    If measured SOC is already outside the desired band, do not force an
    infeasible one-hour correction against inverter limits or empty supply.
    """
    soc = measured_soc_kwh(state)
    min_soc, max_soc = soc_bounds_kwh(state, constraints)
    charge_room = state.battery_max_charge_kw * INTERVAL_HOURS
    discharge_room = state.battery_max_discharge_kw * INTERVAL_HOURS
    reachable_lo = max(0.0, soc - discharge_room)
    reachable_hi = min(state.battery_capacity_kwh, soc + charge_room)

    if soc < min_soc:
        next_min = soc
        next_max = min(reachable_hi, max_soc)
    elif soc > max_soc:
        next_min = max(reachable_lo, min_soc)
        next_max = soc
    else:
        next_min = max(min_soc, reachable_lo)
        next_max = min(max_soc, reachable_hi)

    if next_min > next_max:
        next_min = next_max = soc
    return soc, next_min, next_max


def diesel_energy_cap_kwh(state: CommunityState) -> float:
    """Maximum diesel kWh this interval given capacity and remaining fuel."""
    fuel_cap = state.diesel_fuel_liters / DIESEL_LITERS_PER_KWH if DIESEL_LITERS_PER_KWH > 0 else 0.0
    return min(state.diesel_max_kw * INTERVAL_HOURS, fuel_cap)


def add_generation_constraints(
    model: LpProblem,
    variables: dict[str, Any],
    state: CommunityState,
    demand: Demand,
) -> None:
    """Bound renewable use, diesel output, and unserved energy by availability."""
    model += variables["solar_used"] <= state.solar_available_kw, "solar_availability"
    model += variables["wind_used"] <= state.wind_available_kw, "wind_availability"
    model += variables["diesel_generation"] <= diesel_energy_cap_kwh(state), "diesel_capacity"
    model += variables["unserved_tier1"] <= demand.tier1_kw, "unserved_t1_cap"
    model += variables["unserved_tier2"] <= demand.tier2_kw, "unserved_t2_cap"
    model += variables["unserved_tier3"] <= demand.tier3_kw, "unserved_t3_cap"
    model += variables["unserved_tier4"] <= demand.tier4_kw, "unserved_t4_cap"


def add_battery_constraints(
    model: LpProblem,
    variables: dict[str, Any],
    state: CommunityState,
    constraints: OptimizationConstraints,
) -> None:
    """Charge/discharge limits, SOC window, and no simultaneous charge/discharge."""
    charge = variables["battery_charge"]
    discharge = variables["battery_discharge"]
    is_charging = variables["is_charging"]

    model += charge <= state.battery_max_charge_kw, "charge_inverter"
    model += discharge <= state.battery_max_discharge_kw, "discharge_inverter"
    model += charge <= state.battery_max_charge_kw * is_charging, "charge_mode"
    model += (
        discharge <= state.battery_max_discharge_kw * (1 - is_charging),
        "discharge_mode",
    )

    soc, next_min, next_max = feasible_soc_window_kwh(state, constraints)
    next_soc = soc + INTERVAL_HOURS * (charge - discharge)
    model += next_soc >= next_min, "soc_min"
    model += next_soc <= next_max, "soc_max"
    model += next_soc <= state.battery_capacity_kwh, "soc_capacity"
    model += next_soc >= 0.0, "soc_nonneg"


def add_energy_balance(
    model: LpProblem,
    variables: dict[str, Any],
    demand: Demand,
) -> None:
    """Generation plus unserved energy equals demand plus battery charging."""
    supply = lpSum(
        [
            variables["solar_used"],
            variables["wind_used"],
            variables["battery_discharge"],
            variables["diesel_generation"],
            variables["unserved_tier1"],
            variables["unserved_tier2"],
            variables["unserved_tier3"],
            variables["unserved_tier4"],
        ]
    )
    sink = demand.total_kw + variables["battery_charge"]
    model += supply == sink, "energy_balance"
