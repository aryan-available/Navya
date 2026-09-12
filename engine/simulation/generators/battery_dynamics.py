"""
battery_dynamics.py

Simulates Battery Energy Storage System (BESS) state-of-charge (SOC) evolution,
internal resistance losses, charge/discharge efficiency, and cycle degradation.
Enforces physical hardware limits (min SOC, max SOC, C-rate bounds).
"""

import sys
import os
from datetime import datetime
from typing import Optional

# Ensure shared_schemas is accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from shared.schemas.simulation_models import BatteryState
except ImportError:
    from shared_schemas import BatteryState

CHARGE_EFFICIENCY = 0.95      # Coulombic efficiency into chemistry
DISCHARGE_EFFICIENCY = 0.95   # Inversion / resistive efficiency out
SELF_DISCHARGE_PCT_PER_HOUR = 0.02
DEGRADATION_PCT_PER_1000_CYCLES = 2.0


class Battery:
    """Simulated BESS pack with physical constraints and state evolution."""

    def __init__(self,
                 capacity_kwh: float = 100.0,
                 initial_soc_pct: float = 60.0,
                 min_soc_pct: float = 10.0,
                 max_soc_pct: float = 95.0,
                 max_charge_rate_kw: Optional[float] = None,
                 max_discharge_rate_kw: Optional[float] = None):
        self.nominal_capacity_kwh = capacity_kwh
        self.capacity_kwh = capacity_kwh
        self.soc_pct = initial_soc_pct
        self.min_soc_pct = min_soc_pct
        self.max_soc_pct = max_soc_pct
        self.max_charge_rate_kw = max_charge_rate_kw if max_charge_rate_kw is not None else capacity_kwh * 0.5
        self.max_discharge_rate_kw = max_discharge_rate_kw if max_discharge_rate_kw is not None else capacity_kwh * 0.5
        self.health_pct = 100.0
        self.capacity_multiplier = 1.0  # Modified by battery_failure scenario
        self._cumulative_throughput_kwh = 0.0

    def set_capacity_multiplier(self, multiplier: float):
        """Used by scenario_injector to simulate battery cell/rack failure."""
        self.capacity_multiplier = max(0.0, min(1.0, multiplier))

    def reset(self, initial_soc_pct: float = 60.0):
        """Resets battery state to nominal baseline."""
        self.soc_pct = initial_soc_pct
        self.capacity_multiplier = 1.0
        self.health_pct = 100.0
        self._cumulative_throughput_kwh = 0.0

    def step(self, dt: datetime, requested_kw: float, step_hours: float = 0.25) -> BatteryState:
        """
        Advances battery state by step_hours given requested_kw:
        - requested_kw > 0: charging
        - requested_kw < 0: discharging
        - requested_kw == 0: idle (self-discharge only)
        Returns resulting BatteryState.
        """
        # Calculate active usable capacity factoring health and scenario multiplier
        effective_capacity = self.nominal_capacity_kwh * (self.health_pct / 100.0) * self.capacity_multiplier
        if effective_capacity <= 0.0:
            self.soc_pct = 0.0
            return BatteryState(
                timestamp=dt.isoformat(),
                soc_pct=0.0,
                capacity_kwh=0.0,
                charge_rate_kw=0.0,
                health_pct=round(self.health_pct, 2),
            )

        # Rate limits scaled by active capacity fraction
        max_chg = self.max_charge_rate_kw * self.capacity_multiplier
        max_dis = self.max_discharge_rate_kw * self.capacity_multiplier
        clamped_kw = max(-max_dis, min(max_chg, requested_kw))

        current_kwh = effective_capacity * (self.soc_pct / 100.0)

        # Power flow integration
        if clamped_kw >= 0.0:
            delivered_kwh = clamped_kw * step_hours * CHARGE_EFFICIENCY
            new_kwh = current_kwh + delivered_kwh
        else:
            drawn_kwh = abs(clamped_kw) * step_hours / DISCHARGE_EFFICIENCY
            new_kwh = current_kwh - drawn_kwh

        # Parasitic self-discharge
        new_kwh -= effective_capacity * (SELF_DISCHARGE_PCT_PER_HOUR / 100.0) * step_hours

        # Enforce SOC bounds
        min_kwh = effective_capacity * (self.min_soc_pct / 100.0)
        max_kwh = effective_capacity * (self.max_soc_pct / 100.0)
        actual_kwh = max(min_kwh, min(max_kwh, new_kwh))

        # Calculate actual net rate after clipping bounds
        energy_delta = actual_kwh - current_kwh
        if clamped_kw > 0.0:
            actual_kw = energy_delta / (step_hours * CHARGE_EFFICIENCY) if step_hours > 0 else 0.0
        elif clamped_kw < 0.0:
            actual_kw = -(abs(energy_delta) * DISCHARGE_EFFICIENCY / step_hours) if step_hours > 0 else 0.0
        else:
            actual_kw = 0.0

        # Cycle degradation tracking
        self._cumulative_throughput_kwh += abs(energy_delta)
        equivalent_cycles = self._cumulative_throughput_kwh / (2.0 * max(1.0, self.nominal_capacity_kwh))
        self.health_pct = max(60.0, 100.0 - (equivalent_cycles / 1000.0) * DEGRADATION_PCT_PER_1000_CYCLES)

        self.soc_pct = round((actual_kwh / effective_capacity) * 100.0, 2)

        return BatteryState(
            timestamp=dt.isoformat(),
            soc_pct=self.soc_pct,
            capacity_kwh=round(effective_capacity, 2),
            charge_rate_kw=round(actual_kw, 2),
            health_pct=round(self.health_pct, 2),
        )


if __name__ == "__main__":
    from datetime import timedelta
    bat = Battery(capacity_kwh=100.0, initial_soc_pct=50.0)
    now = datetime(2026, 6, 21, 6, 0)
    for req in [30.0, 30.0, -20.0, -20.0, -50.0, 0.0]:
        st = bat.step(now, req, step_hours=1.0)
        print(f"{st.timestamp} | Req: {req:5.1f} kW -> SOC: {st.soc_pct:5.2f}% | Rate: {st.charge_rate_kw:5.1f} kW | Health: {st.health_pct}%")
        now += timedelta(hours=1)
