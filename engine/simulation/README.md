# Member D — Simulation & Forecasting Engine

**GridPilot: Autonomous Microgrid Energy Mix Optimizer**
**Owner**: Member D
**Service Runtime**: Python 3.13 + FastAPI

This module owns the synthetic physical world and predictive forecasting engines. It simulates the physical microgrid dynamics (solar PV, wind turbine, community demand across 4 priority tiers, battery storage, and diesel generation), connects to live Open-Meteo weather APIs with automatic synthetic fallback, and exposes FastAPI endpoints for Member C (Optimizer) and Member B (Backend Orchestrator).

---

## 1. Directory Layout

```
engine/simulation/
├── shared_schemas.py           # Local schema bridge matching shared/schemas/
├── README.md                   # This documentation
├── generators/                 # Ground-truth physical simulators
│   ├── solar_profile.py        # Solar geometry, clear-sky GHI & panel generation
│   ├── wind_profile.py         # Autocorrelated wind random walk & turbine curve
│   ├── demand_profile.py       # 9 community load blocks tagged with LoadTier
│   ├── battery_dynamics.py     # BESS SOC evolution, Coulombic loss, degradation
│   └── diesel_fuel_state.py    # Fuel tank state, burn rates & idling penalty
├── forecasting/                # Predictive agents (24-72h)
│   ├── forecast_solar.py       # Solar GHI and PV output forecasting
│   ├── forecast_wind.py        # Wind velocity and turbine forecasting
│   └── forecast_demand.py      # Demand forecast by tier & Stage 0 Early Warning
├── events/                     # What-If scenario injection
│   └── scenario_injector.py    # 5 disruption triggers (§3.7 & §3.11 of spec)
├── weather/                    # Meteorological data client
│   └── weather_client.py       # Open-Meteo REST client with synthetic fallback
├── routers/                    # FastAPI HTTP routes
│   └── simulate.py             # GET /state, GET /forecast, POST /events, steps
└── tests/                      # Automated test suite
    ├── test_simulation.py      # Unit tests for physical models and generators
    └── test_api.py             # FastAPI TestClient API endpoint tests
```

---

## 2. Quick Start & Setup

### Prerequisites
- Python 3.10+ (tested on Python 3.13)

### Installation
From the `gridpilot/engine/` directory:
```bash
pip install -r requirements.txt
```

### Running the Test Suite
```bash
# Run all unit and API tests
pytest simulation/tests/ -v
```

### Starting the Microservice
From `gridpilot/engine/`:
```bash
uvicorn app.main:app --reload --port 8000
```
- Interactive Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative ReDoc UI: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 3. Endpoints & API Summary

All endpoints are reachable both at root (e.g. `/state`) and with prefix (e.g. `/simulation/state`):

| Endpoint | Method | Description |
|---|---|---|
| `/state` | `GET` | Instantaneous microgrid snapshot (generation, load by tier, battery, diesel, weather, active scenario) |
| `/forecast` | `GET` | 24h/72h projections for solar, wind, and demand by tier with confidence decay vectors |
| `/events` | `POST` | Injects a What-If disruption scenario (`cloud_cover`, `wind_drop`, `demand_surge`, `battery_failure`, `diesel_price_spike`) |
| `/simulation/battery/step` | `POST` | Steps battery charge/discharge by requested kW for a given time duration |
| `/simulation/diesel/step` | `POST` | Steps diesel generator dispatch and fuel consumption |
| `/simulation/diesel/refuel` | `POST` | Logs a fuel replenishment event |
| `/simulation/reset` | `POST` | Cancels any active scenario and restores nominal microgrid parameters |

---

## 4. Integration Guide for Team Members

### For Member C (Optimization Engine — `engine/optimizer/`)
- **Same Process Integration**: You can directly import `demand_profile.get_demand_by_tier()`, `battery_dynamics.Battery`, and `diesel_fuel_state.DieselGenerator`.
- **Shortfall Ladder (Stage 0 Early Warning)**: Call `forecasting.forecast_demand.flag_early_warning()` to check for projected supply deficits 6-12h ahead.
- **Shortfall Ladder (Stage 4 Fair Load Shedding)**: Each demand point carries a `LoadTier` (1 = Critical/Clinic, 2 = Important, 3 = Homes, 4 = Flexible). Shed Tier 4 first, protect Tier 1 always.
- **Fuel Runway Agent**: Read `diesel.consumption_rate_l_per_kwh` from `DieselFuelState` or call `diesel.step()` in rolling forward simulations.

### For Member B (Backend Orchestrator — `backend/`)
- The Python Engine runs on `http://localhost:8000`.
- In `backend/src/services/engineClient.ts`, make HTTP calls to `/state`, `/forecast?horizon_hours=24`, and `/events`.
- Full contract shapes are documented in `docs/engine-contract.md` and typed in `shared/schemas/contracts.ts`.

### For Member A (Frontend — `frontend/`)
- Real-time digital twin and forecast timelines reflect live data shapes without hardcoding.
- Load tiers match color codes and priority icons in `shared/constants.md`.

---

## 5. Physical Modeling Highlights

1. **Solar**: Bell-curve clear-sky GHI centered on solar noon, attenuated by cloud cover percentage, converted to kW with STC reference (1000 W/m²).
2. **Wind**: Atmospheric diurnal variation combined with an autocorrelated random walk (no erratic white noise), feeding a cubic turbine power curve with cut-in (3 m/s), rated (12 m/s), and cut-out (25 m/s).
3. **Community Demand**: 9 distinct load blocks with morning/evening Gaussian human peaks, tagged strictly by priority tier.
4. **Battery Storage**: 95% charge/discharge Coulombic efficiency, 0.02%/h self-discharge, cycle-based degradation, and hardware SOC limits [10%, 95%].
5. **Diesel Generator**: Sweet-spot 80% efficiency (0.28 L/kWh) with low-load penalty (<30% load penalty 1.6x = 0.448 L/kWh), automatic cutoff when dry, and refuel tracking.
6. **Weather API**: Live Open-Meteo REST calls with non-blocking fallback to synthetic model, labeled as `"live"` or `"synthetic"`.
