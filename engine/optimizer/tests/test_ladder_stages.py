"""Shortfall-ladder stage escalation and shed order."""

from __future__ import annotations

from datetime import datetime

from engine.optimizer.ladder.shortfall_ladder import apply_stage_to_demand, run_shortfall_ladder
from engine.optimizer.models import CommunityState, Demand, ForecastState, OptimizationConstraints


def _forecast() -> ForecastState:
    return ForecastState(solar_next_hour=5.0, wind_next_hour=1.0, demand_growth_factor=1.0)


def _constraints() -> OptimizationConstraints:
    return OptimizationConstraints(
        battery_min_soc=0.2,
        battery_max_soc=0.9,
        co2_cost=0.08,
        degradation_cost=0.04,
    )


def _state(**overrides: float) -> CommunityState:
    payload: dict[str, object] = {
        "timestamp": datetime(2026, 8, 1, 21, 0, 0),
        "solar_available_kw": 0.0,
        "wind_available_kw": 0.0,
        "battery_soc_kwh": 20.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 20.0,
        "battery_max_discharge_kw": 20.0,
        "diesel_max_kw": 5.0,
        "diesel_fuel_liters": 4.0,
        "diesel_cost_per_kwh": 0.60,
    }
    payload.update(overrides)
    return CommunityState.model_validate(payload)


def _demand() -> Demand:
    return Demand(tier1_kw=10.0, tier2_kw=10.0, tier3_kw=20.0, tier4_kw=20.0)


def test_stages_escalate_correctly() -> None:
    demand = _demand()
    d0 = apply_stage_to_demand(demand, 0)
    d1 = apply_stage_to_demand(demand, 1)
    d2 = apply_stage_to_demand(demand, 2)
    d3 = apply_stage_to_demand(demand, 3)
    assert d0.total_kw == demand.total_kw
    assert abs(d1.tier4_kw - demand.tier4_kw * 0.7) < 1e-9
    assert d1.total_kw > d2.total_kw > d3.total_kw
    assert d2.tier4_kw == 0.0
    assert d3.tier4_kw == 0.0
    assert abs(d3.tier3_kw - demand.tier3_kw * 0.5) < 1e-9


def test_tier4_sheds_first() -> None:
    demand = _demand()
    d1 = apply_stage_to_demand(demand, 1)
    d2 = apply_stage_to_demand(demand, 2)
    assert d1.tier4_kw < demand.tier4_kw
    assert d1.tier1_kw == demand.tier1_kw
    assert d2.tier4_kw == 0.0
    assert d2.tier3_kw == demand.tier3_kw
    plan = run_shortfall_ladder(_state(), demand, _forecast(), _constraints(), 4)
    assert "LADDER_STAGE_4" in plan.reason_codes


def test_tier3_second() -> None:
    demand = _demand()
    d3 = apply_stage_to_demand(demand, 3)
    assert d3.tier4_kw == 0.0
    assert d3.tier3_kw < demand.tier3_kw
    assert d3.tier2_kw == demand.tier2_kw
    assert d3.tier1_kw == demand.tier1_kw


def test_tier2_third() -> None:
    demand = _demand()
    state = _state()
    d4 = apply_stage_to_demand(demand, 4, state, _constraints())
    assert d4.tier4_kw == 0.0
    assert d4.tier3_kw == 0.0
    assert d4.tier2_kw <= demand.tier2_kw
    assert d4.tier1_kw > 0.0


def test_tier1_preserved() -> None:
    demand = _demand()
    for stage in range(4):
        adjusted = apply_stage_to_demand(demand, stage, _state(), _constraints())
        assert adjusted.tier1_kw == demand.tier1_kw
    stage4 = apply_stage_to_demand(demand, 4, _state(), _constraints())
    assert stage4.tier4_kw == 0.0
    assert stage4.tier3_kw == 0.0
    if stage4.tier1_kw < demand.tier1_kw:
        assert stage4.tier2_kw == 0.0
    plan = run_shortfall_ladder(_state(), demand, _forecast(), _constraints(), 4)
    assert plan.unserved_tier1 <= plan.unserved_tier2 + 1e-6
