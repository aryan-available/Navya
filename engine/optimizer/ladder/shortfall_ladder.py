"""Five-stage shortfall response ladder. Reuses dispatch_optimizer."""

from __future__ import annotations

from engine.optimizer.core.constraints import (
    diesel_energy_cap_kwh,
    measured_soc_kwh,
    soc_bounds_kwh,
)
from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.models import (
    CommunityState,
    Demand,
    DispatchPlan,
    ForecastState,
    OptimizationConstraints,
)


def _available_supply_kw(state: CommunityState, constraints: OptimizationConstraints) -> float:
    min_soc, _ = soc_bounds_kwh(state, constraints)
    discharge_room = min(
        state.battery_max_discharge_kw,
        max(0.0, measured_soc_kwh(state) - min_soc),
    )
    return (
        state.solar_available_kw
        + state.wind_available_kw
        + discharge_room
        + diesel_energy_cap_kwh(state)
    )


def apply_stage_to_demand(
    demand: Demand,
    stage: int,
    state: CommunityState | None = None,
    constraints: OptimizationConstraints | None = None,
) -> Demand:
    """Return demand after applying ladder stage 0–4. Never sheds Tier 1 first."""
    if stage < 0 or stage > 4:
        raise ValueError("stage must be an integer in [0, 4]")

    t1, t2, t3, t4 = demand.tier1_kw, demand.tier2_kw, demand.tier3_kw, demand.tier4_kw

    if stage == 0:
        return demand.model_copy()
    if stage == 1:
        return Demand(tier1_kw=t1, tier2_kw=t2, tier3_kw=t3, tier4_kw=t4 * 0.7)
    if stage == 2:
        return Demand(tier1_kw=t1, tier2_kw=t2, tier3_kw=t3, tier4_kw=0.0)
    if stage == 3:
        return Demand(tier1_kw=t1, tier2_kw=t2, tier3_kw=t3 * 0.5, tier4_kw=0.0)

    remaining = [t1, t2, t3, t4]
    if state is not None and constraints is not None:
        supply = _available_supply_kw(state, constraints)
        shortfall = max(0.0, sum(remaining) - supply)
        for index in (3, 2, 1, 0):
            if shortfall <= 0:
                break
            shed = min(remaining[index], shortfall)
            remaining[index] -= shed
            shortfall -= shed
    else:
        remaining = [t1, 0.0, 0.0, 0.0]
    return Demand(
        tier1_kw=remaining[0],
        tier2_kw=remaining[1],
        tier3_kw=remaining[2],
        tier4_kw=remaining[3],
    )


def run_shortfall_ladder(
    state: CommunityState,
    demand: Demand,
    forecast: ForecastState,
    constraints: OptimizationConstraints,
    stage: int,
) -> DispatchPlan:
    """Apply the requested ladder stage, then solve with dispatch_optimizer."""
    adjusted = apply_stage_to_demand(demand, stage, state, constraints)
    plan = dispatch_optimizer(state, adjusted, forecast, constraints)
    stage_code = f"LADDER_STAGE_{stage}"
    codes = [stage_code, *plan.reason_codes]
    return plan.model_copy(update={"reason_codes": codes})
