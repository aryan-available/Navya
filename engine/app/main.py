"""Urjadrishti Member C FastAPI microservice."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engine.optimizer.routers.optimize import router

app = FastAPI(
    title="Urjadrishti Optimization Engine",
    description="Member C microgrid energy-mix optimizer (PuLP / FastAPI).",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# 1. CORS Middleware for public and cross-origin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Health check and diagnostic endpoints
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "UP",
        "service": "gridpilot-engine",
        "version": "1.0.0"
    }

@app.get("/", tags=["Health"])
def root():
    return {
        "service": "gridpilot-engine",
        "status": "UP",
        "docs": "/docs"
    }

# 3. Router inclusion
app.include_router(router)

# 4. Direct script execution entrypoint
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("engine.app.main:app", host=host, port=port, reload=False)

