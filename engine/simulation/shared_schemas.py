"""
shared_schemas.py

Simulation schemas and contract models.
Imports from shared.schemas.simulation_models when present in PYTHONPATH,
or provides standalone fallback definitions so engine/simulation can be run isolated.
"""

import sys
import os

# Add monorepo root to sys.path if not present
_cur = os.path.dirname(os.path.abspath(__file__))
_engine_dir = os.path.dirname(_cur)
_root_dir = os.path.dirname(_engine_dir)
for p in [_cur, _engine_dir, _root_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from shared.schemas.simulation_models import (
        LoadTier,
        WeatherState,
        WeatherForecast,
        DemandPoint,
        DemandForecastPoint,
        DemandForecast,
        CombinedForecast,
        BatteryState,
        DieselFuelState,
        ScenarioEvent,
        ScenarioTriggerRequest,
        BatteryStepRequest,
        DieselStepRequest,
        DieselRefuelRequest,
        SimulationState,
    )
except ImportError:
    from enum import IntEnum
    from typing import Dict, List, Optional, Any
    from pydantic import BaseModel, Field

    class LoadTier(IntEnum):
        CRITICAL = 1
        IMPORTANT = 2
        HOMES = 3
        FLEXIBLE = 4

    class WeatherState(BaseModel):
        timestamp: str
        ghi_w_m2: float
        wind_speed_m_s: float
        temperature_c: float
        cloud_cover_pct: float
        source: str = "synthetic"

    class WeatherForecast(BaseModel):
        generated_at: str
        horizon_hours: int
        points: List[Dict[str, Any]]
        confidence: List[float]

    class DemandPoint(BaseModel):
        timestamp: str
        tier: LoadTier
        load_kw: float
        label: str

    class DemandForecastPoint(BaseModel):
        timestamp: str
        total_kw: float
        by_tier: Dict[int, float]

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
        timestamp: str
        soc_pct: float
        capacity_kwh: float
        charge_rate_kw: float
        health_pct: float = 100.0

    class DieselFuelState(BaseModel):
        timestamp: str
        fuel_remaining_l: float
        tank_capacity_l: float
        consumption_rate_l_per_kwh: float
        generator_on: bool
        current_load_kw: float = 0.0
        last_refuel_at: Optional[str] = None
        refuel_history: List[Dict[str, Any]] = []

    class ScenarioEvent(BaseModel):
        name: str
        triggered_at: str
        magnitude: float
        duration_hours: float
        metadata: Dict[str, Any] = {}

    class ScenarioTriggerRequest(BaseModel):
        name: str
        severity: Optional[float] = None
        duration_hours: Optional[float] = None
        tier: Optional[int] = None

    class BatteryStepRequest(BaseModel):
        requested_kw: float
        step_hours: float = 0.25

    class DieselStepRequest(BaseModel):
        dispatch_kw: float
        step_hours: float = 0.25

    class DieselRefuelRequest(BaseModel):
        liters: float

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
