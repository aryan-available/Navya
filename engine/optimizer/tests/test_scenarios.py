"""Eleven canonical operating scenarios for the dispatch MIP."""

from __future__ import annotations

from datetime import datetime

from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.models import CommunityState, Demand, ForecastState, OptimizationConstraints

_EPS = 5e-2


def _forecast(**overrides: float) -> ForecastState:
    payload = {"solar_next_hour": 30.0, "wind_next_hour": 8.0, "demand_growth_factor": 1.0}
    payload.update(overrides)
    return ForecastState.model_validate(payload)


def _constraints() -> OptimizationConstraints:
    return OptimizationConstraints(
        battery_min_soc=0.2,
        battery_max_soc=0.9,
        co2_cost=0.10,
        degradation_cost=0.05,
    )


def _state(**overrides: float) -> CommunityState:
    payload: dict[str, object] = {
        "timestamp": datetime(2026, 4, 15, 12, 0, 0),
        "solar_available_kw": 45.0,
        "wind_available_kw": 12.0,
        "battery_soc_kwh": 55.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 25.0,
        "battery_max_discharge_kw": 25.0,
        "diesel_max_kw": 30.0,
        "diesel_fuel_liters": 180.0,
        "diesel_cost_per_kwh": 0.48,
    }
    payload.update(overrides)
    return CommunityState.model_validate(payload)


def _demand(**overrides: float) -> Demand:
    payload = {"tier1_kw": 8.0, "tier2_kw": 6.0, "tier3_kw": 12.0, "tier4_kw": 8.0}
    payload.update(overrides)
    return Demand.model_validate(payload)


def _unserved(plan) -> float:
    return plan.unserved_tier1 + plan.unserved_tier2 + plan.unserved_tier3 + plan.unserved_tier4


def test_scenario_01_normal_sunny_day() -> None:
    plan = dispatch_optimizer(_state(), _demand(), _forecast(), _constraints())
    assert plan.solar_used > _EPS
    assert _unserved(plan) < _EPS
    assert plan.diesel_output < _EPS
    assert "FULL_DEMAND_SERVED" in plan.reason_codes


def test_scenario_02_cloud_cover() -> None:
    plan = dispatch_optimizer(
        _state(solar_available_kw=6.0),
        _demand(),
        _forecast(solar_next_hour=5.0),
        _constraints(),
    )
    assert plan.solar_used <= 6.0 + _EPS
    assert plan.battery_discharge + plan.diesel_output + plan.wind_used > _EPS


def test_scenario_03_wind_drop() -> None:
    plan = dispatch_optimizer(
        _state(wind_available_kw=0.5),
        _demand(),
        _forecast(wind_next_hour=0.0),
        _constraints(),
    )
    assert plan.wind_used <= 0.5 + _EPS
    assert _unserved(plan) < _EPS


def test_scenario_04_evening_peak() -> None:
    plan = dispatch_optimizer(
        _state(solar_available_kw=0.0, timestamp=datetime(2026, 4, 15, 19, 0, 0)),
        _demand(tier3_kw=25.0, tier4_kw=18.0),
        _forecast(),
        _constraints(),
    )
    assert plan.battery_discharge + plan.diesel_output + plan.wind_used > _EPS
    assert plan.reliability_score > 0.5


def test_scenario_05_diesel_outage() -> None:
    plan = dispatch_optimizer(
        _state(diesel_max_kw=0.0, diesel_fuel_liters=0.0, solar_available_kw=5.0),
        _demand(),
        _forecast(),
        _constraints(),
    )
    assert plan.diesel_output < _EPS
    assert plan.unserved_tier4 >= plan.unserved_tier1


def test_scenario_06_battery_low() -> None:
    plan = dispatch_optimizer(
        _state(battery_soc_kwh=20.0, solar_available_kw=0.0, wind_available_kw=0.0),
        _demand(),
        _forecast(),
        _constraints(),
    )
    assert plan.battery_discharge < _EPS
    assert plan.diesel_output > _EPS
    assert "BATTERY_PROTECTED" in plan.reason_codes


def test_scenario_07_battery_full() -> None:
    plan = dispatch_optimizer(
        _state(battery_soc_kwh=90.0, solar_available_kw=60.0),
        _demand(tier1_kw=4.0, tier2_kw=3.0, tier3_kw=3.0, tier4_kw=2.0),
        _forecast(),
        _constraints(),
    )
    assert plan.battery_charge < _EPS
    assert plan.diesel_output < _EPS


def test_scenario_08_industrial_surge() -> None:
    plan = dispatch_optimizer(
        _state(),
        _demand(tier4_kw=80.0),
        _forecast(),
        _constraints(),
    )
    assert plan.unserved_tier4 >= plan.unserved_tier1
    assert plan.unserved_tier1 < _EPS or plan.unserved_tier4 > _EPS


def test_scenario_09_festival_demand() -> None:
    plan = dispatch_optimizer(
        _state(),
        _demand(tier1_kw=12.0, tier2_kw=15.0, tier3_kw=40.0, tier4_kw=35.0),
        _forecast(demand_growth_factor=1.8),
        _constraints(),
    )
    assert plan.unserved_tier4 + 1e-6 >= plan.unserved_tier3
    assert plan.unserved_tier1 <= plan.unserved_tier2 + _EPS


def test_scenario_10_fuel_shortage() -> None:
    plan = dispatch_optimizer(
        _state(
            solar_available_kw=0.0,
            wind_available_kw=0.0,
            battery_soc_kwh=22.0,
            diesel_fuel_liters=1.0,
        ),
        _demand(),
        _forecast(),
        _constraints(),
    )
    assert "LOW_FUEL_CONSERVATION" in plan.reason_codes
    assert plan.diesel_output <= (1.0 / 0.27) + _EPS


def test_scenario_11_blackout_recovery() -> None:
    plan = dispatch_optimizer(
        _state(solar_available_kw=40.0, battery_soc_kwh=25.0, diesel_fuel_liters=40.0),
        _demand(tier1_kw=10.0, tier2_kw=8.0, tier3_kw=8.0, tier4_kw=4.0),
        _forecast(),
        _constraints(),
    )
    assert plan.reliability_score > 0.7
    assert plan.unserved_tier1 < _EPS
    assert "GRID_BALANCED" in plan.reason_codes
