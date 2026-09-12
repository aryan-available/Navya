"""Battery SOC window, inverter ratings, and complementary charge/discharge."""

from __future__ import annotations

from datetime import datetime

from engine.optimizer.core.constraints import soc_bounds_kwh
from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.models import CommunityState, Demand, ForecastState, OptimizationConstraints

_EPS = 1e-3


def _forecast() -> ForecastState:
    return ForecastState(solar_next_hour=10.0, wind_next_hour=2.0, demand_growth_factor=1.0)


def _constraints() -> OptimizationConstraints:
    return OptimizationConstraints(
        battery_min_soc=0.2,
        battery_max_soc=0.9,
        co2_cost=0.05,
        degradation_cost=0.03,
    )


def _state(**overrides: float) -> CommunityState:
    payload: dict[str, object] = {
        "timestamp": datetime(2026, 3, 1, 18, 0, 0),
        "solar_available_kw": 0.0,
        "wind_available_kw": 0.0,
        "battery_soc_kwh": 50.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 20.0,
        "battery_max_discharge_kw": 20.0,
        "diesel_max_kw": 0.0,
        "diesel_fuel_liters": 0.0,
        "diesel_cost_per_kwh": 0.40,
    }
    payload.update(overrides)
    return CommunityState.model_validate(payload)


def test_minimum_soc_blocks_further_discharge() -> None:
    demand = Demand(tier1_kw=10.0, tier2_kw=5.0, tier3_kw=5.0, tier4_kw=5.0)
    state = _state(battery_soc_kwh=20.0)
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    min_soc, _ = soc_bounds_kwh(state, _constraints())
    next_soc = state.battery_soc_kwh + plan.battery_charge - plan.battery_discharge
    assert next_soc >= min_soc - _EPS
    assert plan.battery_discharge < _EPS


def test_maximum_soc_blocks_further_charge() -> None:
    demand = Demand(tier1_kw=2.0, tier2_kw=1.0, tier3_kw=1.0, tier4_kw=1.0)
    state = _state(
        solar_available_kw=80.0,
        battery_soc_kwh=90.0,
        diesel_max_kw=10.0,
        diesel_fuel_liters=50.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    _, max_soc = soc_bounds_kwh(state, _constraints())
    next_soc = state.battery_soc_kwh + plan.battery_charge - plan.battery_discharge
    assert next_soc <= max_soc + _EPS
    assert plan.battery_charge < _EPS


def test_inverter_limits_bind() -> None:
    demand = Demand(tier1_kw=1.0, tier2_kw=1.0, tier3_kw=1.0, tier4_kw=1.0)
    state = _state(
        solar_available_kw=100.0,
        battery_soc_kwh=40.0,
        battery_max_charge_kw=5.0,
        diesel_max_kw=5.0,
        diesel_fuel_liters=40.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    assert plan.battery_charge <= 5.0 + _EPS

    peak = Demand(tier1_kw=30.0, tier2_kw=20.0, tier3_kw=10.0, tier4_kw=10.0)
    empty_pv = _state(battery_soc_kwh=80.0, battery_max_discharge_kw=8.0)
    plan_d = dispatch_optimizer(empty_pv, peak, _forecast(), _constraints())
    assert plan_d.battery_discharge <= 8.0 + _EPS


def test_no_simultaneous_charge_and_discharge() -> None:
    demand = Demand(tier1_kw=12.0, tier2_kw=8.0, tier3_kw=10.0, tier4_kw=5.0)
    state = _state(
        solar_available_kw=20.0,
        wind_available_kw=5.0,
        battery_soc_kwh=50.0,
        diesel_max_kw=15.0,
        diesel_fuel_liters=80.0,
    )
    plan = dispatch_optimizer(state, demand, _forecast(), _constraints())
    assert plan.battery_charge * plan.battery_discharge < _EPS
