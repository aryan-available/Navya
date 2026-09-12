"""
diesel_fuel_state.py

Represents the "Battery/Diesel State Agent" responsible for tracking diesel
genset operational state, fuel consumption rates, tank levels, and refuel events.
Feeds Member C's Fuel Runway Agent (fuel_runway.py) to forecast days of diesel remaining.
"""

import sys
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

# Ensure shared_schemas is accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from shared.schemas.simulation_models import DieselFuelState
except ImportError:
    from shared_schemas import DieselFuelState

# Specific fuel consumption curve for small microgrid genset:
# Best efficiency near ~80% rated load (0.28 L/kWh)
# Degraded efficiency when idling or running below 30% rated load (1.6x penalty)
BASE_CONSUMPTION_L_PER_KWH = 0.28
IDLE_PENALTY_MULTIPLIER = 1.6


class DieselGenerator:
    """Simulates diesel generator mechanics, fuel burn rates, and fuel storage."""

    def __init__(self,
                 tank_capacity_l: float = 2000.0,
                 rated_capacity_kw: float = 50.0,
                 initial_fuel_l: Optional[float] = None):
        self.tank_capacity_l = tank_capacity_l
        self.rated_capacity_kw = rated_capacity_kw
        self.fuel_remaining_l = initial_fuel_l if initial_fuel_l is not None else tank_capacity_l
        self.generator_on = False
        self.last_refuel_at: Optional[str] = None
        self.refuel_history: List[Dict[str, Any]] = []

    def get_consumption_rate(self, load_kw: float) -> float:
        """Calculates specific fuel consumption in L/kWh based on load fraction."""
        if load_kw <= 0:
            return 0.0
        load_fraction = load_kw / self.rated_capacity_kw
        if load_fraction < 0.30:
            return BASE_CONSUMPTION_L_PER_KWH * IDLE_PENALTY_MULTIPLIER
        return BASE_CONSUMPTION_L_PER_KWH

    def step(self, dt: datetime, dispatch_kw: float, step_hours: float = 0.25) -> DieselFuelState:
        """
        Calculates fuel burn over step_hours for dispatched kW.
        Clamps to rated capacity and remaining fuel.
        Automatically stops generator if fuel runs dry.
        """
        requested_kw = min(self.rated_capacity_kw, max(0.0, dispatch_kw))
        self.generator_on = (requested_kw > 0.0) and (self.fuel_remaining_l > 0.0)

        rate = self.get_consumption_rate(requested_kw) if self.generator_on else 0.0
        fuel_needed = requested_kw * step_hours * rate

        # Fuel consumption
        if self.fuel_remaining_l >= fuel_needed:
            self.fuel_remaining_l -= fuel_needed
            actual_kw = requested_kw if self.generator_on else 0.0
        else:
            # Partial step before running out of fuel
            fraction_ran = self.fuel_remaining_l / fuel_needed if fuel_needed > 0 else 0.0
            actual_kw = requested_kw * fraction_ran
            self.fuel_remaining_l = 0.0
            self.generator_on = False

        return DieselFuelState(
            timestamp=dt.isoformat(),
            fuel_remaining_l=round(self.fuel_remaining_l, 2),
            tank_capacity_l=self.tank_capacity_l,
            consumption_rate_l_per_kwh=round(rate, 4),
            generator_on=self.generator_on,
            current_load_kw=round(actual_kw, 2),
            last_refuel_at=self.last_refuel_at,
            refuel_history=list(self.refuel_history),
        )

    def refuel(self, dt: datetime, liters: float):
        """Adds fuel to storage tank up to capacity limit."""
        if liters <= 0:
            return
        self.fuel_remaining_l = min(self.tank_capacity_l, self.fuel_remaining_l + liters)
        ts = dt.isoformat()
        self.last_refuel_at = ts
        self.refuel_history.append({"timestamp": ts, "liters": round(liters, 2)})

    def reset(self, fuel_l: Optional[float] = None):
        """Resets fuel state to tank capacity or given liters."""
        self.fuel_remaining_l = fuel_l if fuel_l is not None else self.tank_capacity_l
        self.generator_on = False
        self.last_refuel_at = None
        self.refuel_history.clear()


if __name__ == "__main__":
    from datetime import timedelta
    gen = DieselGenerator(tank_capacity_l=500.0, rated_capacity_kw=50.0, initial_fuel_l=100.0)
    now = datetime(2026, 6, 21, 18, 0)
    for load in [40.0, 40.0, 10.0, 50.0, 0.0]:
        st = gen.step(now, load, step_hours=1.0)
        print(f"{st.timestamp} | Load: {st.current_load_kw:4.1f} kW | Remaining: {st.fuel_remaining_l:6.2f} L | Burn: {st.consumption_rate_l_per_kwh} L/kWh")
        now += timedelta(hours=1)
