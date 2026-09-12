"""
generators package: physical world simulators for solar, wind, demand, battery, and diesel.
"""
from .solar_profile import get_irradiance, get_panel_output_kw, generate_series as generate_solar_series
from .wind_profile import get_wind_speed, get_turbine_output_kw, generate_series as generate_wind_series
from .demand_profile import get_demand_at, get_total_demand_kw, get_demand_by_tier, generate_series as generate_demand_series
from .battery_dynamics import Battery
from .diesel_fuel_state import DieselGenerator

__all__ = [
    "get_irradiance",
    "get_panel_output_kw",
    "generate_solar_series",
    "get_wind_speed",
    "get_turbine_output_kw",
    "generate_wind_series",
    "get_demand_at",
    "get_total_demand_kw",
    "get_demand_by_tier",
    "generate_demand_series",
    "Battery",
    "DieselGenerator",
]
