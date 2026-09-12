# GridPilot System Architecture

## 1. Overview
GridPilot is an intelligent autonomous energy manager for off-grid microgrids. It coordinates solar arrays, wind turbines, battery storage, and diesel generation to meet multi-tier community electricity demand with high reliability, minimal fuel cost, and low emissions.

## 2. 4-Person Monorepo Structure

```
gridpilot/
├── frontend/             --> Member A (React + Vite + TypeScript)
├── backend/              --> Member B (Node.js + Express + TypeScript + Socket.IO + Mongoose)
├── engine/
│   ├── optimizer/        --> Member C (Python + FastAPI: LP/MILP dispatch, ladder, runway)
│   ├── simulation/       --> Member D (Python + FastAPI: weather, dynamics, what-if injection)
│   ├── app/main.py       --> Shared FastAPI entry point
│   └── requirements.txt
├── shared/schemas/       --> Joint contracts (TypeScript & Pydantic definitions)
└── docs/                 --> API & Engine specifications
```

## 3. Polyglot Monorepo Data Flow
1. **Frontend (React)** communicates exclusively with **Backend (Node.js)** via REST and Socket.IO.
2. **Backend (Node.js)** is the single orchestrator and API gateway. It queries MongoDB Atlas, proxies engine operations to the **Python FastAPI Engine** via typed HTTP, and calls Claude/OpenAI for grounded explanations.
3. **Engine (Python)** has no direct connection to MongoDB or Frontend; it performs pure numerical simulation, forecasting, and mathematical LP/MILP optimization.
