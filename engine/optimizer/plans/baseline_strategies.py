"""Deterministic heuristic baselines used to benchmark the MIP dispatcher."""

from __future__ import annotations

from engine.optimizer.core.constraints import (
    diesel_energy_cap_kwh,
    measured_soc_kwh,
    soc_bounds_kwh,
)
from engine.optimizer.core.explain import explain
from engine.optimizer.ladder.load_tiers import (
    DIESEL_KG_CO2_PER_KWH,
    TIER1_PENALTY,
    TIER2_PENALTY,
    TIER3_PENALTY,
    TIER4_PENALTY,
)
from engine.optimizer.models import (
    CommunityState,
    Demand,
    DispatchPlan,
    ForecastState,
    OptimizationConstraints,
)

_EPS = 1e-9


def _headroom(state: CommunityState, constraints: OptimizationConstraints) -> tuple[float, float]:
    min_soc, max_soc = soc_bounds_kwh(state, constraints)
    soc = measured_soc_kwh(state)
    charge_room = min(state.battery_max_charge_kw, max_soc - soc)
    discharge_room = min(state.battery_max_discharge_kw, soc - min_soc)
    return max(0.0, charge_room), max(0.0, discharge_room)


def _allocate_unserved(remaining: float, demand: Demand) -> tuple[float, float, float, float]:
    """Shed lowest-priority tiers first until ``remaining`` shortfall is assigned."""
    t4 = min(demand.tier4_kw, remaining)
    remaining -= t4
    t3 = min(demand.tier3_kw, remaining)
    remaining -= t3
    t2 = min(demand.tier2_kw, remaining)
    remaining -= t2
    t1 = min(demand.tier1_kw, remaining)
    return t1, t2, t3, t4


def _plan_from_setpoints(
    solar: float,
    wind: float,
    charge: float,
    discharge: float,
    diesel: float,
    demand: Demand,
    state: CommunityState,
    constraints: OptimizationConstraints,
) -> DispatchPlan:
    served = solar + wind + discharge + diesel - charge
    shortfall = max(0.0, demand.total_kw - served)
    u1, u2, u3, u4 = _allocate_unserved(shortfall, demand)
    unserved_total = u1 + u2 + u3 + u4
    total_cost = (
        diesel * state.diesel_cost_per_kwh
        + (charge + discharge) * constraints.degradation_cost
        + diesel * constraints.co2_cost
        + u1 * TIER1_PENALTY
        + u2 * TIER2_PENALTY
        + u3 * TIER3_PENALTY
        + u4 * TIER4_PENALTY
    )
    reliability = 1.0 if demand.total_kw <= _EPS else max(0.0, 1.0 - unserved_total / demand.total_kw)
    plan = DispatchPlan(
        solar_used=solar,
        wind_used=wind,
        battery_charge=charge,
        battery_discharge=discharge,
        diesel_output=diesel,
        unserved_tier1=u1,
        unserved_tier2=u2,
        unserved_tier3=u3,
        unserved_tier4=u4,
        total_cost=total_cost,
        emissions=diesel * DIESEL_KG_CO2_PER_KWH,
        reliability_score=min(1.0, reliability),
        reason_codes=[],
    )
    return plan.model_copy(update={"reason_codes": explain(plan, state, demand, constraints)})


def renewable_first(
    state: CommunityState,
    demand: Demand,
    forecast: ForecastState,
    constraints: OptimizationConstraints,
) -> DispatchPlan:
    """Serve load with solar, then wind, then battery, then diesel."""
    del forecast
    charge_room, discharge_room = _headroom(state, constraints)
    remaining = demand.total_kw
    solar = min(state.solar_available_kw, remaining)
    remaining -= solar
    wind = min(state.wind_available_kw, remaining)
    remaining -= wind
    discharge = min(discharge_room, remaining)
    remaining -= discharge
    diesel = min(diesel_energy_cap_kwh(state), remaining)
    remaining -= diesel
    surplus = max(0.0, state.solar_available_kw - solar) + max(0.0, state.wind_available_kw - wind)
    extra_solar = min(state.solar_available_kw - solar, surplus, charge_room)
    solar += extra_solar
    charge = extra_solar
    leftover_wind = min(state.wind_available_kw - wind, max(0.0, charge_room - charge))
    wind += leftover_wind
    charge += leftover_wind
    if charge > _EPS and discharge > _EPS:
        discharge = 0.0
    return _plan_from_setpoints(solar, wind, charge, discharge, diesel, demand, state, constraints)


def diesel_first(
    state: CommunityState,
    demand: Demand,
    forecast: ForecastState,
    constraints: OptimizationConstraints,
) -> DispatchPlan:
    """Serve load with diesel, then battery, then wind, then solar."""
    del forecast
    _, discharge_room = _headroom(state, constraints)
    remaining = demand.total_kw
    diesel = min(diesel_energy_cap_kwh(state), remaining)
    remaining -= diesel
    discharge = min(discharge_room, remaining)
    remaining -= discharge
    wind = min(state.wind_available_kw, remaining)
    remaining -= wind
    solar = min(state.solar_available_kw, remaining)
    remaining -= solar
    return _plan_from_setpoints(solar, wind, 0.0, discharge, diesel, demand, state, constraints)
