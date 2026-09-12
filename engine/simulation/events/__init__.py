"""
events package: What-If scenario injector simulating grid stress events and equipment anomalies.
"""
from .scenario_injector import (
    VALID_SCENARIOS,
    trigger,
    trigger_cloud_cover,
    trigger_wind_drop,
    trigger_demand_surge,
    trigger_battery_failure,
    trigger_diesel_price_spike,
)

__all__ = [
    "VALID_SCENARIOS",
    "trigger",
    "trigger_cloud_cover",
    "trigger_wind_drop",
    "trigger_demand_surge",
    "trigger_battery_failure",
    "trigger_diesel_price_spike",
]
