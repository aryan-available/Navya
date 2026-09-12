"""
simulation_models.py

Pydantic schemas and shared contracts for Member D (Simulation & Forecasting)
and the rest of the GridPilot system.
Compatible with Pydantic v2.
"""

from __future__ import annotations
from enum import IntEnum
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field


class LoadTier(IntEnum):
    """
    1 = Critical (clinic, water pump)
    2 = Important (schools, street lighting)
    3 = Homes (residential blocks)
    4 = Flexible (small industry, EV chargers)
    """
    CRITICAL = 1
    IMPORTANT = 2
    HOMES = 3
    FLEXIBLE = 4


class WeatherState(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    ghi_w_m2: float = Field(..., description="Global Horizontal Irradiance in W/m^2")
    wind_speed_m_s: float = Field(..., description="Wind speed at 10m in m/s")
    temperature_c: float = Field(..., description="Ambient temperature in degrees Celsius")
    cloud_cover_pct: float = Field(..., description="Cloud cover percentage (0-100)")
    source: str = Field(default="synthetic", description="'live' (Open-Meteo) or 'synthetic'")


class WeatherForecast(BaseModel):
    generated_at: str = Field(..., description="ISO 8601 timestamp of forecast creation")
    horizon_hours: int = Field(..., description="Forecast horizon length in hours (e.g., 24 or 72)")
    points: List[Dict[str, Any]] = Field(..., description="List of time step projections")
    confidence: List[float] = Field(..., description="Confidence scores (0.0 - 1.0) matching points")


class DemandPoint(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    tier: LoadTier = Field(..., description="Load priority tier (1-4)")
    load_kw: float = Field(..., description="Active load in kW")
    label: str = Field(..., description="Load identifier, e.g. 'clinic', 'household_block_1'")


class DemandForecastPoint(BaseModel):
    timestamp: str
    total_kw: float
    by_tier: Dict[int, float] = Field(..., description="Load per tier in kW (keys: 1, 2, 3, 4)")


class DemandForecast(BaseModel):
    generated_at: str
    horizon_hours: int
    points: List[Dict[str, Any]]
    confidence: List[float]


class CombinedForecast(BaseModel):
    generated_at: str
    horizon_hours: int
    step_minutes: int
    solar: WeatherForecast
    wind: WeatherForecast
    demand: Dict[str, Any]


class BatteryState(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    soc_pct: float = Field(..., ge=0.0, le=100.0, description="State of Charge percentage")
    capacity_kwh: float = Field(..., description="Nominal battery pack capacity in kWh")
    charge_rate_kw: float = Field(..., description="Current rate (+ for charging, - for discharging)")
    health_pct: float = Field(default=100.0, ge=0.0, le=100.0, description="Battery health percentage")


class RefuelRecord(BaseModel):
    timestamp: str
    liters: float


class DieselFuelState(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    fuel_remaining_l: float = Field(..., ge=0.0, description="Liters of diesel currently in storage tank")
    tank_capacity_l: float = Field(..., description="Total fuel storage capacity in liters")
    consumption_rate_l_per_kwh: float = Field(..., description="Fuel burn rate in L/kWh at current load")
    generator_on: bool = Field(..., description="True if generator is currently firing")
    current_load_kw: float = Field(default=0.0, description="Active electrical load supplied by diesel in kW")
    last_refuel_at: Optional[str] = Field(default=None, description="ISO timestamp of last refuel")
    refuel_history: List[Dict[str, Any]] = Field(default_factory=list, description="Historical log of refuel events")


class ScenarioEvent(BaseModel):
    name: str = Field(..., description="Scenario identifier: cloud_cover, wind_drop, demand_surge, battery_failure, diesel_price_spike")
    triggered_at: str = Field(..., description="ISO 8601 trigger timestamp")
    magnitude: float = Field(..., description="Normalized severity parameter or multiplier")
    duration_hours: float = Field(..., description="Scenario duration in hours")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Scenario-specific parameters")


class ScenarioTriggerRequest(BaseModel):
    name: str = Field(..., description="Scenario event name")
    severity: Optional[float] = Field(default=None, description="Severity (0.0 - 1.0 or percentage depending on scenario)")
    duration_hours: Optional[float] = Field(default=None, description="Duration in hours")
    tier: Optional[int] = Field(default=None, description="Optional target load tier (e.g. 4 for EV rush)")


class BatteryStepRequest(BaseModel):
    requested_kw: float = Field(..., description="Charge (+) or discharge (-) kW requested by dispatch optimizer")
    step_hours: float = Field(default=0.25, description="Time step duration in hours (e.g. 0.25 = 15m, 1.0 = 1h)")


class DieselStepRequest(BaseModel):
    dispatch_kw: float = Field(..., ge=0.0, description="Dispatched kW requested from diesel genset")
    step_hours: float = Field(default=0.25, description="Time step duration in hours")


class DieselRefuelRequest(BaseModel):
    liters: float = Field(..., gt=0.0, description="Amount of fuel added in liters")


class SimulationState(BaseModel):
    timestamp: str
    solar_output_kw: float
    wind_output_kw: float
    total_renewable_kw: float
    demand: Dict[str, Any]
    battery: BatteryState
    diesel: DieselFuelState
    weather: WeatherState
    active_scenario: Optional[ScenarioEvent] = None
    system_balance_kw: float
