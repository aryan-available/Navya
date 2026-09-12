"""Pydantic data models for the Urjadrishti dispatch optimizer."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

OPTIMIZE_EXAMPLE: dict[str, object] = {
    "state": {
        "timestamp": "2026-06-01T12:00:00",
        "solar_available_kw": 40.0,
        "wind_available_kw": 10.0,
        "battery_soc_kwh": 50.0,
        "battery_capacity_kwh": 100.0,
        "battery_max_charge_kw": 25.0,
        "battery_max_discharge_kw": 25.0,
        "diesel_max_kw": 30.0,
        "diesel_fuel_liters": 150.0,
        "diesel_cost_per_kwh": 0.45,
    },
    "demand": {
        "tier1_kw": 8.0,
        "tier2_kw": 6.0,
        "tier3_kw": 12.0,
        "tier4_kw": 10.0,
    },
    "forecast": {
        "solar_next_hour": 35.0,
        "wind_next_hour": 8.0,
        "demand_growth_factor": 1.0,
    },
    "constraints": {
        "battery_min_soc": 0.2,
        "battery_max_soc": 0.9,
        "co2_cost": 0.08,
        "degradation_cost": 0.04,
    },
}


class CommunityState(BaseModel):
    """Observed microgrid asset and fuel state for one dispatch interval."""

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    solar_available_kw: float = Field(ge=0.0)
    wind_available_kw: float = Field(ge=0.0)
    battery_soc_kwh: float = Field(ge=0.0)
    battery_capacity_kwh: float = Field(gt=0.0)
    battery_max_charge_kw: float = Field(ge=0.0)
    battery_max_discharge_kw: float = Field(ge=0.0)
    diesel_max_kw: float = Field(ge=0.0)
    diesel_fuel_liters: float = Field(ge=0.0)
    diesel_cost_per_kwh: float = Field(ge=0.0)


class Demand(BaseModel):
    """Criticality-tiered community demand (kW) for one interval."""

    model_config = ConfigDict(extra="forbid")

    tier1_kw: float = Field(ge=0.0)
    tier2_kw: float = Field(ge=0.0)
    tier3_kw: float = Field(ge=0.0)
    tier4_kw: float = Field(ge=0.0)

    @computed_field
    @property
    def total_kw(self) -> float:
        """Sum of all tier demands."""
        return self.tier1_kw + self.tier2_kw + self.tier3_kw + self.tier4_kw


class ForecastState(BaseModel):
    """Short-horizon forecast used by runway simulation and planning."""

    model_config = ConfigDict(extra="forbid")

    solar_next_hour: float = Field(ge=0.0)
    wind_next_hour: float = Field(ge=0.0)
    demand_growth_factor: float = Field(ge=0.0)


class OptimizationConstraints(BaseModel):
    """SOC bounds and cost coefficients for the dispatch MIP."""

    model_config = ConfigDict(extra="forbid")

    battery_min_soc: float = Field(ge=0.0)
    battery_max_soc: float = Field(ge=0.0)
    co2_cost: float = Field(ge=0.0)
    degradation_cost: float = Field(ge=0.0)


class DispatchPlan(BaseModel):
    """Feasible one-interval dispatch with cost, emissions, and reason codes."""

    model_config = ConfigDict(extra="forbid")

    solar_used: float = Field(ge=0.0)
    wind_used: float = Field(ge=0.0)
    battery_charge: float = Field(ge=0.0)
    battery_discharge: float = Field(ge=0.0)
    diesel_output: float = Field(ge=0.0)
    unserved_tier1: float = Field(ge=0.0)
    unserved_tier2: float = Field(ge=0.0)
    unserved_tier3: float = Field(ge=0.0)
    unserved_tier4: float = Field(ge=0.0)
    total_cost: float
    emissions: float = Field(ge=0.0)
    reliability_score: float = Field(ge=0.0, le=1.0)
    reason_codes: list[str]


class OptimizeRequest(BaseModel):
    """POST /optimize request body."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": OPTIMIZE_EXAMPLE, "examples": [OPTIMIZE_EXAMPLE]},
    )

    state: CommunityState
    demand: Demand
    forecast: ForecastState
    constraints: OptimizationConstraints


class LadderRequest(BaseModel):
    """POST /ladder request body."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {**OPTIMIZE_EXAMPLE, "stage": 2},
            "examples": [{**OPTIMIZE_EXAMPLE, "stage": 2}],
        },
    )

    state: CommunityState
    demand: Demand
    forecast: ForecastState
    constraints: OptimizationConstraints
    stage: int = Field(ge=0, le=4)


class RunwayProjection(BaseModel):
    """Deterministic fuel-runway projection."""

    model_config = ConfigDict(extra="forbid")

    remaining_liters: float = Field(ge=0.0)
    daily_diesel_consumption: float = Field(ge=0.0)
    projected_days_remaining: float = Field(ge=0.0)


class SignalResponse(BaseModel):
    """Operational runway signal."""

    model_config = ConfigDict(extra="forbid")

    color: Literal["GREEN", "YELLOW", "RED"]
    message: str


class RunwayQuery(BaseModel):
    """Query parameters for GET /runway and GET /signal."""

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime | None = None
    solar_available_kw: float = Field(default=40.0, ge=0.0)
    wind_available_kw: float = Field(default=10.0, ge=0.0)
    battery_soc_kwh: float = Field(default=50.0, ge=0.0)
    battery_capacity_kwh: float = Field(default=100.0, gt=0.0)
    battery_max_charge_kw: float = Field(default=25.0, ge=0.0)
    battery_max_discharge_kw: float = Field(default=25.0, ge=0.0)
    diesel_max_kw: float = Field(default=30.0, ge=0.0)
    diesel_fuel_liters: float = Field(default=200.0, ge=0.0)
    diesel_cost_per_kwh: float = Field(default=0.45, ge=0.0)
    tier1_kw: float = Field(default=8.0, ge=0.0)
    tier2_kw: float = Field(default=6.0, ge=0.0)
    tier3_kw: float = Field(default=12.0, ge=0.0)
    tier4_kw: float = Field(default=10.0, ge=0.0)
    solar_next_hour: float = Field(default=35.0, ge=0.0)
    wind_next_hour: float = Field(default=8.0, ge=0.0)
    demand_growth_factor: float = Field(default=1.0, ge=0.0)
    battery_min_soc: float = Field(default=0.2, ge=0.0)
    battery_max_soc: float = Field(default=0.9, ge=0.0)
    co2_cost: float = Field(default=0.08, ge=0.0)
    degradation_cost: float = Field(default=0.04, ge=0.0)

    def to_state(self) -> CommunityState:
        """Build CommunityState from query fields."""
        return CommunityState(
            timestamp=self.timestamp or datetime(2026, 1, 1, 12, 0, 0),
            solar_available_kw=self.solar_available_kw,
            wind_available_kw=self.wind_available_kw,
            battery_soc_kwh=self.battery_soc_kwh,
            battery_capacity_kwh=self.battery_capacity_kwh,
            battery_max_charge_kw=self.battery_max_charge_kw,
            battery_max_discharge_kw=self.battery_max_discharge_kw,
            diesel_max_kw=self.diesel_max_kw,
            diesel_fuel_liters=self.diesel_fuel_liters,
            diesel_cost_per_kwh=self.diesel_cost_per_kwh,
        )

    def to_demand(self) -> Demand:
        """Build Demand from query fields."""
        return Demand(
            tier1_kw=self.tier1_kw,
            tier2_kw=self.tier2_kw,
            tier3_kw=self.tier3_kw,
            tier4_kw=self.tier4_kw,
        )

    def to_forecast(self) -> ForecastState:
        """Build ForecastState from query fields."""
        return ForecastState(
            solar_next_hour=self.solar_next_hour,
            wind_next_hour=self.wind_next_hour,
            demand_growth_factor=self.demand_growth_factor,
        )

    def to_constraints(self) -> OptimizationConstraints:
        """Build OptimizationConstraints from query fields."""
        return OptimizationConstraints(
            battery_min_soc=self.battery_min_soc,
            battery_max_soc=self.battery_max_soc,
            co2_cost=self.co2_cost,
            degradation_cost=self.degradation_cost,
        )
