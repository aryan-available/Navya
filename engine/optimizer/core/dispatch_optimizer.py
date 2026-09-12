"""PuLP mixed-integer dispatch optimizer for one operating interval."""

from __future__ import annotations

from typing import Any

from pulp import (
    PULP_CBC_CMD,
    LpBinary,
    LpMinimize,
    LpProblem,
    LpStatus,
    LpVariable,
    value,
)

from engine.optimizer.core.constraints import (
    add_battery_constraints,
    add_energy_balance,
    add_generation_constraints,
)
from engine.optimizer.core.explain import explain
from engine.optimizer.core.objective import build_objective
from engine.optimizer.ladder.load_tiers import DIESEL_KG_CO2_PER_KWH
from engine.optimizer.models import (
    CommunityState,
    Demand,
    DispatchPlan,
    ForecastState,
    OptimizationConstraints,
)


def _variables() -> dict[str, Any]:
    """Create non-negative dispatch variables plus a charge-mode binary."""
    names = (
        "solar_used",
        "wind_used",
        "battery_charge",
        "battery_discharge",
        "diesel_generation",
        "unserved_tier1",
        "unserved_tier2",
        "unserved_tier3",
        "unserved_tier4",
    )
    variables: dict[str, Any] = {
        name: LpVariable(name, lowBound=0.0) for name in names
    }
    variables["is_charging"] = LpVariable("is_charging", cat=LpBinary)
    return variables


def _extract(var: Any) -> float:
    raw = value(var)
    if raw is None:
        return 0.0
    return max(0.0, float(raw))


def _reliability(demand: Demand, unserved_total: float) -> float:
    total = demand.total_kw
    if total <= 1e-9:
        return 1.0
    return max(0.0, min(1.0, 1.0 - unserved_total / total))


def dispatch_optimizer(
    state: CommunityState,
    demand: Demand,
    forecast: ForecastState,
    constraints: OptimizationConstraints,
) -> DispatchPlan:
    """Solve the one-hour economic dispatch MIP and return a DispatchPlan.

    ``forecast`` is accepted for API compatibility and downstream runway
    coupling; the interval MIP is fully determined by ``state``, ``demand``,
    and ``constraints``.
    """
    del forecast
    model = LpProblem("urjadrishti_dispatch", LpMinimize)
    variables = _variables()
    build_objective(model, variables, state, constraints)
    add_generation_constraints(model, variables, state, demand)
    add_battery_constraints(model, variables, state, constraints)
    add_energy_balance(model, variables, demand)
    model.solve(PULP_CBC_CMD(msg=False))
    if LpStatus.get(model.status, "Not Solved") != "Optimal":
        raise RuntimeError(f"Dispatch solver failed: {LpStatus[model.status]}")

    solar_used = _extract(variables["solar_used"])
    wind_used = _extract(variables["wind_used"])
    battery_charge = _extract(variables["battery_charge"])
    battery_discharge = _extract(variables["battery_discharge"])
    diesel_output = _extract(variables["diesel_generation"])
    unserved_tier1 = _extract(variables["unserved_tier1"])
    unserved_tier2 = _extract(variables["unserved_tier2"])
    unserved_tier3 = _extract(variables["unserved_tier3"])
    unserved_tier4 = _extract(variables["unserved_tier4"])

    if battery_charge > 1e-6 and battery_discharge > 1e-6:
        overlap = min(battery_charge, battery_discharge)
        battery_charge -= overlap
        battery_discharge -= overlap

    unserved_total = unserved_tier1 + unserved_tier2 + unserved_tier3 + unserved_tier4
    total_cost = float(value(model.objective) or 0.0)
    emissions = diesel_output * DIESEL_KG_CO2_PER_KWH
    plan = DispatchPlan(
        solar_used=solar_used,
        wind_used=wind_used,
        battery_charge=battery_charge,
        battery_discharge=battery_discharge,
        diesel_output=diesel_output,
        unserved_tier1=unserved_tier1,
        unserved_tier2=unserved_tier2,
        unserved_tier3=unserved_tier3,
        unserved_tier4=unserved_tier4,
        total_cost=total_cost,
        emissions=emissions,
        reliability_score=_reliability(demand, unserved_total),
        reason_codes=[],
    )
    return plan.model_copy(update={"reason_codes": explain(plan, state, demand, constraints)})
