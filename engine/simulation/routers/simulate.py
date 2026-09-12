"""
simulate.py

FastAPI router exposing Member D's simulation and forecasting endpoints:
- GET /state (alias /simulation/state): Instantaneous live snapshot of microgrid
- GET /forecast (alias /simulation/forecast): 24h/72h forward projections
- POST /events (alias /simulation/events): Trigger What-If scenarios
- POST /battery/step: Execute battery charge/discharge step
- POST /diesel/step: Execute diesel dispatch step
- POST /diesel/refuel: Deliver fuel to genset tank
- POST /reset: Clear active scenarios and restore nominal baseline
"""

import sys
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, status

# Ensure simulation and shared_schemas are in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from generators import solar_profile, wind_profile, demand_profile, battery_dynamics, diesel_fuel_state
from forecasting import forecast_solar, forecast_wind, forecast_demand
from events import scenario_injector
from weather import weather_client
try:
    from shared.schemas.simulation_models import (
        SimulationState,
        CombinedForecast,
        ScenarioEvent,
        ScenarioTriggerRequest,
        BatteryStepRequest,
        BatteryState,
        DieselStepRequest,
        DieselRefuelRequest,
        DieselFuelState,
        WeatherForecast,
    )
except ImportError:
    from shared_schemas import (
        SimulationState,
        CombinedForecast,
        ScenarioEvent,
        ScenarioTriggerRequest,
        BatteryStepRequest,
        BatteryState,
        DieselStepRequest,
        DieselRefuelRequest,
        DieselFuelState,
        WeatherForecast,
    )

router = APIRouter()


class SimulationEnvironment:
    """Encapsulates mutable live physical state for the simulated microgrid."""

    def __init__(self):
        self.battery = battery_dynamics.Battery(capacity_kwh=100.0, initial_soc_pct=60.0)
        self.diesel = diesel_fuel_state.DieselGenerator(tank_capacity_l=2000.0, rated_capacity_kw=50.0)
        self.active_scenario: Optional[ScenarioEvent] = None
        self.scenario_expires_at: Optional[datetime] = None

    def check_scenario_expiry(self, now: datetime):
        if self.scenario_expires_at and now >= self.scenario_expires_at:
            # Scenario duration finished, reset modifiers
            self.clear_scenario()

    def set_scenario(self, event: ScenarioEvent):
        now = datetime.now()
        self.active_scenario = event
        self.scenario_expires_at = now + timedelta(hours=event.duration_hours)

        # Apply immediate physical overrides
        if event.name == "battery_failure":
            avail_fraction = event.metadata.get("available_capacity_fraction", 0.0)
            self.battery.set_capacity_multiplier(avail_fraction)

    def clear_scenario(self):
        self.active_scenario = None
        self.scenario_expires_at = None
        self.battery.set_capacity_multiplier(1.0)


# Module-level simulation environment singleton
env = SimulationEnvironment()


@router.get("/state", response_model=SimulationState, summary="Live microgrid state snapshot")
def get_state(lat: float = 18.5204, lon: float = 73.8567) -> SimulationState:
    """Returns the current real-time state of the microgrid with active generation and loads."""
    now = datetime.now()
    env.check_scenario_expiry(now)

    # Active scenario parameters
    cloud_cover = None
    wind_mult = 1.0
    demand_mult = 1.0
    demand_target_tier = None

    if env.active_scenario:
        sc = env.active_scenario
        if sc.name == "cloud_cover":
            cloud_cover = sc.metadata.get("cloud_cover_pct", 70.0)
        elif sc.name == "wind_drop":
            wind_mult = sc.metadata.get("speed_multiplier", 0.40)
        elif sc.name == "demand_surge":
            demand_mult = sc.metadata.get("multiplier", 1.50)
            demand_target_tier = sc.metadata.get("tier")

    # Fetch/synthesize weather
    w_state = weather_client.get_current_weather(
        lat=lat,
        lon=lon,
        use_live=True,
        cloud_cover_override=cloud_cover,
        wind_multiplier=wind_mult
    )

    # Calculate generation
    solar_kw = solar_profile.get_panel_output_kw(
        now,
        array_capacity_kw=100.0,
        cloud_cover_pct=w_state.cloud_cover_pct,
        jitter=True
    )
    wind_kw = wind_profile.get_turbine_output_kw(
        w_state.wind_speed_m_s,
        rated_capacity_kw=30.0
    )
    total_renewable = round(solar_kw + wind_kw, 2)

    # Calculate demand
    demand_points = demand_profile.get_demand_at(
        now,
        demand_multiplier=demand_mult,
        target_tier=demand_target_tier,
        jitter=True
    )
    tot_demand = round(sum(p.load_kw for p in demand_points), 2)
    by_tier = demand_profile.get_demand_by_tier(
        now,
        demand_multiplier=demand_mult,
        target_tier=demand_target_tier,
        jitter=True
    )
    blocks = [
        {"label": p.label, "tier": int(p.tier), "load_kw": p.load_kw}
        for p in demand_points
    ]

    # Current battery & diesel states
    effective_cap = env.battery.nominal_capacity_kwh * (env.battery.health_pct / 100.0) * env.battery.capacity_multiplier
    bat_state = BatteryState(
        timestamp=now.isoformat(),
        soc_pct=env.battery.soc_pct,
        capacity_kwh=round(effective_cap, 2),
        charge_rate_kw=0.0,
        health_pct=round(env.battery.health_pct, 2)
    )

    dsl_state = DieselFuelState(
        timestamp=now.isoformat(),
        fuel_remaining_l=round(env.diesel.fuel_remaining_l, 2),
        tank_capacity_l=env.diesel.tank_capacity_l,
        consumption_rate_l_per_kwh=round(env.diesel.get_consumption_rate(env.diesel.rated_capacity_kw if env.diesel.generator_on else 0.0), 4),
        generator_on=env.diesel.generator_on,
        current_load_kw=0.0,
        last_refuel_at=env.diesel.last_refuel_at,
        refuel_history=list(env.diesel.refuel_history),
    )

    return SimulationState(
        timestamp=now.isoformat(),
        solar_output_kw=solar_kw,
        wind_output_kw=wind_kw,
        total_renewable_kw=total_renewable,
        demand={
            "total_kw": tot_demand,
            "by_tier": by_tier,
            "blocks": blocks,
        },
        battery=bat_state,
        diesel=dsl_state,
        weather=w_state,
        active_scenario=env.active_scenario,
        system_balance_kw=round(total_renewable - tot_demand, 2)
    )


@router.get("/forecast", response_model=CombinedForecast, summary="Forward 24-72h projections")
def get_forecast(horizon_hours: int = Query(default=24, ge=1, le=168),
                 step_minutes: int = Query(default=60, ge=5, le=360)) -> CombinedForecast:
    """Returns aligned forward projections for solar, wind, and community demand with confidence scores."""
    now = datetime.now()

    cloud_override = 0.0
    wind_mult = 1.0
    demand_mult = 1.0
    target_tier = None

    if env.active_scenario:
        sc = env.active_scenario
        if sc.name == "cloud_cover":
            cloud_override = sc.metadata.get("cloud_cover_pct", 70.0)
        elif sc.name == "wind_drop":
            wind_mult = sc.metadata.get("speed_multiplier", 0.40)
        elif sc.name == "demand_surge":
            demand_mult = sc.metadata.get("multiplier", 1.50)
            target_tier = sc.metadata.get("tier")

    solar_fc = forecast_solar.forecast(
        now,
        horizon_hours=horizon_hours,
        step_minutes=step_minutes,
        array_capacity_kw=100.0,
        cloud_cover_pct=cloud_override
    )

    wind_fc = forecast_wind.forecast(
        now,
        horizon_hours=horizon_hours,
        step_minutes=step_minutes,
        rated_capacity_kw=30.0,
        speed_multiplier=wind_mult
    )

    demand_fc = forecast_demand.forecast(
        now,
        horizon_hours=horizon_hours,
        step_minutes=step_minutes,
        demand_multiplier=demand_mult,
        target_tier=target_tier
    )

    return CombinedForecast(
        generated_at=now.isoformat(),
        horizon_hours=horizon_hours,
        step_minutes=step_minutes,
        solar=solar_fc,
        wind=wind_fc,
        demand=demand_fc
    )


@router.post("/events", summary="Trigger a What-If scenario")
def post_event(req: ScenarioTriggerRequest) -> Dict[str, Any]:
    """Injects a disturbance scenario into the simulation (cloud cover, wind drop, surge, battery trip, price spike)."""
    try:
        kwargs = {}
        if req.severity is not None:
            kwargs["severity"] = req.severity
        if req.duration_hours is not None:
            kwargs["duration_hours"] = req.duration_hours
        if req.tier is not None:
            kwargs["tier"] = req.tier

        event = scenario_injector.trigger(req.name, **kwargs)
        env.set_scenario(event)
        return {"status": "injected", "event": event}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/battery/step", response_model=BatteryState, summary="Step battery charge/discharge")
def step_battery(req: BatteryStepRequest) -> BatteryState:
    """Executes a dispatch step for the battery storage system."""
    now = datetime.now()
    return env.battery.step(now, requested_kw=req.requested_kw, step_hours=req.step_hours)


@router.post("/diesel/step", response_model=DieselFuelState, summary="Step diesel genset dispatch")
def step_diesel(req: DieselStepRequest) -> DieselFuelState:
    """Executes a dispatch step for the diesel generator, consuming fuel."""
    now = datetime.now()
    return env.diesel.step(now, dispatch_kw=req.dispatch_kw, step_hours=req.step_hours)


@router.post("/diesel/refuel", response_model=DieselFuelState, summary="Refuel diesel generator")
def refuel_diesel(req: DieselRefuelRequest) -> DieselFuelState:
    """Delivers fuel to the generator tank."""
    now = datetime.now()
    env.diesel.refuel(now, liters=req.liters)
    return env.diesel.step(now, dispatch_kw=0.0, step_hours=0.0)


@router.post("/reset", summary="Reset simulation to baseline")
def reset_simulation() -> Dict[str, str]:
    """Clears all active scenarios and restores nominal microgrid parameters."""
    env.clear_scenario()
    env.battery.reset()
    env.diesel.reset()
    return {"status": "reset", "message": "Simulation returned to nominal baseline"}
