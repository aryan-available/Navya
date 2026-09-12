"""
routers package for simulation FastAPI routes.
"""
from .simulate import router as simulation_router

__all__ = ["simulation_router"]
