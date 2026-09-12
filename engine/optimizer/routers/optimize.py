"""Thin FastAPI routes for dispatch, ladder, runway, and signals."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from engine.optimizer.core.dispatch_optimizer import dispatch_optimizer
from engine.optimizer.ladder.fuel_runway import project_runway
from engine.optimizer.ladder.shortfall_ladder import run_shortfall_ladder
from engine.optimizer.models import (
    DispatchPlan,
    LadderRequest,
    OptimizeRequest,
    RunwayProjection,
    RunwayQuery,
    SignalResponse,
)
from engine.optimizer.plans.baseline_strategies import diesel_first, renewable_first
from engine.optimizer.signals.signal_engine import evaluate_signal

router = APIRouter()


def runway_inputs(query: Annotated[RunwayQuery, Query()]) -> RunwayQuery:
    """Inject GET query parameters as a typed RunwayQuery."""
    return query


@router.post("/optimize", response_model=DispatchPlan)
def optimize(payload: OptimizeRequest) -> DispatchPlan:
    """Solve one-interval economic dispatch."""
    try:
        return dispatch_optimizer(
            payload.state,
            payload.demand,
            payload.forecast,
            payload.constraints,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/ladder", response_model=DispatchPlan)
def ladder(payload: LadderRequest) -> DispatchPlan:
    """Apply a shortfall-ladder stage, then solve dispatch."""
    try:
        return run_shortfall_ladder(
            payload.state,
            payload.demand,
            payload.forecast,
            payload.constraints,
            payload.stage,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/compare")
def compare(payload: OptimizeRequest) -> dict[str, dict[str, float]]:
    """Compare AI optimal dispatch against diesel-first and renewable-first baseline strategies."""
    try:
        ai_plan = dispatch_optimizer(
            payload.state,
            payload.demand,
            payload.forecast,
            payload.constraints,
        )
        diesel_plan = diesel_first(
            payload.state,
            payload.demand,
            payload.forecast,
            payload.constraints,
        )
        renew_plan = renewable_first(
            payload.state,
            payload.demand,
            payload.forecast,
            payload.constraints,
        )

        def _extract_metrics(p: DispatchPlan) -> dict[str, float]:
            served = (p.solar_used + p.wind_used + p.battery_discharge + p.diesel_output) - p.battery_charge
            renewable_used = p.solar_used + p.wind_used
            renewable_share = (renewable_used / max(0.001, served)) * 100.0
            return {
                "cost_usd": round(float(p.total_cost), 2),
                "co2_kg": round(float(p.emissions), 2),
                "diesel_liters": round(float(p.diesel_output * 0.27), 2),
                "renewable_share_pct": round(min(100.0, max(0.0, float(renewable_share))), 1),
                "reliability_pct": round(float(p.reliability_score * 100.0), 1),
            }

        return {
            "ai_optimal": _extract_metrics(ai_plan),
            "diesel_first": _extract_metrics(diesel_plan),
            "renewable_first": _extract_metrics(renew_plan),
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/runway", response_model=RunwayProjection)
def runway(params: RunwayQuery = Depends(runway_inputs)) -> RunwayProjection:
    """Return deterministic fuel-runway projection."""
    return project_runway(
        params.to_state(),
        params.to_demand(),
        params.to_forecast(),
        params.to_constraints(),
    )


@router.get("/signal", response_model=SignalResponse)
def signal(params: RunwayQuery = Depends(runway_inputs)) -> SignalResponse:
    """Return GREEN / YELLOW / RED based on projected runway days."""
    projection = project_runway(
        params.to_state(),
        params.to_demand(),
        params.to_forecast(),
        params.to_constraints(),
    )
    return evaluate_signal(projection.projected_days_remaining)

