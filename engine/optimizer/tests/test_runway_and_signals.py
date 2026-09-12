"""Fuel-runway projection and GREEN / YELLOW / RED signals."""

from __future__ import annotations

from datetime import datetime

from engine.optimizer.ladder.fuel_runway import project_runway
from engine.optimizer.ladder.load_tiers import INFINITE_RUNWAY_DAYS
from engine.optimizer.models import CommunityState, Demand, ForecastState, OptimizationConstraints
from engine.optimizer.signals.signal_engine import evaluate_signal


def _forecast() -> ForecastState:
    return ForecastState(solar_next_hour=40.0, wind_next_hour=10.0, demand_growth_factor=1.0)


def _constraints() -> OptimizationConstraints:
    return OptimizationConstraints(
        battery_min_soc=0.2,
        battery_max_soc=0.9,
        co2_cost=0.08,
        degradation_cost=0.04,
    )


def _state(**overrides: float) -> CommunityState:
    payload: dict[str, object] = {
        "timestamp": datetime(2026, 1, 10, 0, 0, 0),
        "solar_available_kw": 50.0,
        "wind_available_kw": 12.0,
        "battery_soc_kwh": 60.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 25.0,
        "battery_max_discharge_kw": 25.0,
        "diesel_max_kw": 25.0,
        "diesel_fuel_liters": 200.0,
        "diesel_cost_per_kwh": 0.45,
    }
    payload.update(overrides)
    return CommunityState.model_validate(payload)


def _demand() -> Demand:
    return Demand(tier1_kw=8.0, tier2_kw=6.0, tier3_kw=12.0, tier4_kw=10.0)


def test_runway_is_deterministic() -> None:
    first = project_runway(_state(), _demand(), _forecast(), _constraints())
    second = project_runway(_state(), _demand(), _forecast(), _constraints())
    assert first.model_dump() == second.model_dump()
    assert first.daily_diesel_consumption >= 0.0
    assert first.remaining_liters >= 0.0
    assert first.projected_days_remaining >= 0.0


def test_high_fuel_and_renewables_extend_runway() -> None:
    rich = project_runway(_state(diesel_fuel_liters=2000.0), _demand(), _forecast(), _constraints())
    poor = project_runway(
        _state(diesel_fuel_liters=8.0, solar_available_kw=0.0, wind_available_kw=0.0),
        _demand(),
        ForecastState(solar_next_hour=0.0, wind_next_hour=0.0, demand_growth_factor=1.2),
        _constraints(),
    )
    assert rich.projected_days_remaining > poor.projected_days_remaining
    assert poor.projected_days_remaining < 3.0 or poor.daily_diesel_consumption > 0.0


def test_zero_diesel_burn_is_unbounded_runway() -> None:
    projection = project_runway(
        _state(diesel_max_kw=0.0, diesel_fuel_liters=0.0, solar_available_kw=80.0),
        Demand(tier1_kw=2.0, tier2_kw=2.0, tier3_kw=2.0, tier4_kw=1.0),
        _forecast(),
        _constraints(),
    )
    assert projection.daily_diesel_consumption < 1e-6
    assert projection.projected_days_remaining == INFINITE_RUNWAY_DAYS


def test_signal_green_yellow_red_thresholds() -> None:
    assert evaluate_signal(10.0).color == "GREEN"
    assert evaluate_signal(7.1).color == "GREEN"
    assert evaluate_signal(7.0).color == "YELLOW"
    assert evaluate_signal(3.0).color == "YELLOW"
    assert evaluate_signal(2.9).color == "RED"
    assert evaluate_signal(0.0).color == "RED"
    assert evaluate_signal(10.0).message == "RUNWAY_GT_7"
    assert evaluate_signal(5.0).message == "RUNWAY_3_TO_7"
    assert evaluate_signal(1.0).message == "RUNWAY_LT_3"
