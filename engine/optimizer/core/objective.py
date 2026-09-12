"""Reusable PuLP objective: diesel, degradation, CO2, and tier shedding."""

from __future__ import annotations

from typing import Any

from pulp import LpProblem, lpSum

from engine.optimizer.ladder.load_tiers import (
    TIER1_PENALTY,
    TIER2_PENALTY,
    TIER3_PENALTY,
    TIER4_PENALTY,
)
from engine.optimizer.models import CommunityState, OptimizationConstraints


def build_objective(
    model: LpProblem,
    variables: dict[str, Any],
    state: CommunityState,
    constraints: OptimizationConstraints,
) -> None:
    """Attach the global minimization objective to ``model``.

    Minimize diesel fuel cost, battery throughput degradation, CO2 penalty,
    and unserved-energy penalties ordered by load-tier criticality.
    """
    diesel = variables["diesel_generation"]
    charge = variables["battery_charge"]
    discharge = variables["battery_discharge"]

    diesel_cost = diesel * state.diesel_cost_per_kwh
    degradation = (charge + discharge) * constraints.degradation_cost
    co2_penalty = diesel * constraints.co2_cost
    unserved = (
        variables["unserved_tier1"] * TIER1_PENALTY
        + variables["unserved_tier2"] * TIER2_PENALTY
        + variables["unserved_tier3"] * TIER3_PENALTY
        + variables["unserved_tier4"] * TIER4_PENALTY
    )
    renewable_credit = (
        -0.002 * variables["solar_used"] - 0.001 * variables["wind_used"]
    )
    storage_credit = -(constraints.degradation_cost + 0.002) * charge
    model += (
        lpSum([diesel_cost, degradation, co2_penalty, unserved, renewable_credit, storage_credit]),
        "dispatch_cost",
    )
