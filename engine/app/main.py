"""
main.py

Shared FastAPI entrypoint for GridPilot Engine (Joint-owned).
Registers Member D's simulation router and Member C's optimizer router.
Exposes Swagger UI at /docs for independent microservice testing.
"""

import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure engine and root directories are in sys.path
_cur = os.path.dirname(os.path.abspath(__file__))
_engine_dir = os.path.dirname(_cur)
_root_dir = os.path.dirname(_engine_dir)
for p in [_root_dir, _engine_dir, _cur]:
    if p not in sys.path:
        sys.path.insert(0, p)

from simulation.routers.simulate import router as simulation_router
from optimizer.routers.optimize import router as optimizer_router

app = FastAPI(
    title="GridPilot Optimization & Simulation Engine",
    description="Microgrid Energy Mix Optimizer & Autonomous Simulation Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for local Vite frontend (port 5173) and Node backend (port 3000/4000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
def health_check():
    """Health check for deployment orchestrators and backend ping."""
    return {
        "status": "healthy",
        "service": "gridpilot-engine",
        "modules": {
            "simulation": "active",
            "optimizer": "ready_for_registration"
        }
    }


# Register Member D Simulation endpoints:
# Mounted at root for /state, /forecast, /events (matching docs/engine-contract.md)
app.include_router(simulation_router, tags=["Simulation"])
# Also mount under /simulation prefix for explicit namespacing
app.include_router(simulation_router, prefix="/simulation", tags=["Simulation (prefixed)"])
app.include_router(optimizer_router, tags=["Optimizer"])
app.include_router(optimizer_router, prefix="/optimizer", tags=["Optimizer"])




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
