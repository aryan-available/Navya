"""
weather package: Open-Meteo REST integration with synthetic generator fallback.
"""
from .weather_client import get_current_weather

__all__ = ["get_current_weather"]
