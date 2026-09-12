"""Energy-balance coverage: surplus, discharge, diesel, and blackout."""

from __future__ import annotations

from datetime import datetime

from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.models import CommunityState, Demand, ForecastState, OptimizationConstraints

_EPS = 1e-3


def _forecast() -> ForecastState:
    return ForecastState(solar_next_hour=20.0, wind_next_hour=5.0, demand_growth_factor=1.0)


def _constraints() -> OptimizationConstraints:
    return OptimizationConstraints(
        battery_min_soc=0.2,
        battery_max_soc=0.9,
        co2_cost=0.08,
        degradation_cost=0.04,
    )


def _state(**overrides: float) -> CommunityState:
    payload: dict[str, object] = {
        "timestamp": datetime(2026, 6, 21, 12, 0, 0),
        "solar_available_kw": 50.0,
        "wind_available_kw": 10.0,
        "battery_soc_kwh": 50.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 25.0,
        "battery_max_discharge_kw": 25.0,
        "diesel_max_kw": 30.0,
        "diesel_fuel_liters": 200.0,
        "diesel_cost_per_kwh": 0.50,
    }
    payload.update(overrides)
    return CommunityState.model_validate(payload)


def _demand(t1: float = 8.0, t2: float = 6.0, t3: float = 10.0, t4: float = 6.0) -> Demand:
    return Demand(tier1_kw=t1, tier2_kw=t2, tier3_kw=t3, tier4_kw=t4)


def test_surplus_solar_charges_battery_without_diesel() -> None:
    demand = _demand(2.0, 2.0, 2.0, 2.0)
    plan = dispatch_optimizer(_state(solar_available_kw=80.0), demand, _forecast(), _constraints())
    assert plan.diesel_output < _EPS
    assert plan.battery_charge > _EPS
    assert plan.unserved_tier1 + plan.unserved_tier2 + plan.unserved_tier3 + plan.unserved_tier4 < _EPS
    served = plan.solar_used + plan.wind_used + plan.battery_discharge + plan.diesel_output
    assert abs(served - demand.total_kw - plan.battery_charge) < 1e-2


def test_battery_discharge_covers_load_without_renewables() -> None:
    demand = _demand(5.0, 4.0, 4.0, 2.0)
    state = _state(
        solar_available_kw=0.0,
        wind_available_kw=0.0,
        battery_soc_kwh=80.0,
        diesel_max_kw=0.0,
        diesel_fuel_liters=0.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    assert plan.battery_discharge >= demand.total_kw - _EPS
    assert plan.diesel_output < _EPS
    assert plan.battery_charge < _EPS


def test_diesel_support_when_battery_at_floor() -> None:
    demand = _demand(6.0, 4.0, 5.0, 3.0)
    state = _state(
        solar_available_kw=0.0,
        wind_available_kw=0.0,
        battery_soc_kwh=20.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    assert plan.diesel_output >= demand.total_kw - _EPS
    assert plan.battery_discharge < _EPS


def test_zero_generation_sheds_all_demand() -> None:
    demand = _demand(4.0, 3.0, 5.0, 2.0)
    state = _state(
        solar_available_kw=0.0,
        wind_available_kw=0.0,
        battery_soc_kwh=20.0,
        diesel_max_kw=0.0,
        diesel_fuel_liters=0.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    assert plan.solar_used < _EPS
    assert plan.wind_used < _EPS
    assert plan.diesel_output < _EPS
    assert plan.battery_discharge < _EPS
    unserved = (
        plan.unserved_tier1
        + plan.unserved_tier2
        + plan.unserved_tier3
        + plan.unserved_tier4
    )
    assert abs(unserved - demand.total_kw) < 1e-2
    assert plan.reliability_score < _EPS
