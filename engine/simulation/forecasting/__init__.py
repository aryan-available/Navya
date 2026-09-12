"""
forecasting package: forward-looking predictive agents for solar, wind, and community demand.
"""
from . import forecast_solar, forecast_wind, forecast_demand
from .forecast_solar import forecast as solar_forecast
from .forecast_wind import forecast as wind_forecast
from .forecast_demand import forecast as demand_forecast, flag_early_warning

__all__ = [
    "forecast_solar",
    "forecast_wind",
    "forecast_demand",
    "solar_forecast",
    "wind_forecast",
    "demand_forecast",
    "flag_early_warning",
]
