# GridPilot API Contract (Node.js API Gateway)

This document specifies the REST and Socket.IO interfaces exposed by the **Member B (Node.js + Express Backend)** to the **Member A (React Frontend)** and **Community Display Kiosks**.

---

## 1. Authentication Endpoints (`/auth`)

### `POST /auth/register`
Create a new operator account.
- **Request Body:**
```json
{
  "email": "operator@gridpilot.org",
  "password": "SecurePassword123!",
  "role": "operator"
}
```
- **Response (201 Created):**
```json
{
  "user": {
    "id": "usr_671a9b8f2c",
    "email": "operator@gridpilot.org",
    "role": "operator",
    "created_at": "2026-09-12T09:00:00Z"
  }
}
```

### `POST /auth/login`
Authenticate and obtain a JWT.
- **Request Body:**
```json
{
  "email": "operator@gridpilot.org",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_671a9b8f2c",
    "email": "operator@gridpilot.org",
    "role": "operator"
  }
}
```

### `GET /auth/me`
Retrieve authenticated operator profile.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
```json
{
  "user": {
    "id": "usr_671a9b8f2c",
    "email": "operator@gridpilot.org",
    "role": "operator"
  }
}
```

---

## 2. Public Microgrid Signal (`/signal`)

### `GET /signal`
- **Authentication:** None (Public / Unauthenticated / Cache-friendly)
- **Used by:** Community Display Kiosk (`/community-display` route)
- **Response (200 OK):**
```json
{
  "color": "GREEN",
  "message": "Microgrid operating on 100% renewable generation. Battery charging.",
  "updated_at": "2026-09-12T09:00:00Z"
}
```

---

## 3. Microgrid State & Asset Routes (`/api/microgrid`)

All `/api/*` endpoints require header: `Authorization: Bearer <token>`.

### `GET /api/microgrid/state`
Returns the current live operational state of the microgrid (weather, generation, battery, diesel, demand, shortfall stage).

### `GET /api/microgrid/community`
Returns metadata and target reliability parameters for the active off-grid community.

### `GET /api/microgrid/assets`
Returns the operational configuration of physical assets (solar array capacity, wind turbine capacity, battery kWh & C-rate, diesel rated capacity & fuel curve).

---

## 4. Forecasting Routes (`/api/forecast`)

### `GET /api/forecast?horizon=24` (or `72`)
Returns the 24h or 72h ahead hourly prediction of solar irradiance, wind speed, tier-based demand, and projected baseline generation.

---

## 5. Optimization Routes (`/api/optimize`)

### `POST /api/optimize`
Triggers an on-demand rolling-horizon LP/MILP optimization run through the engine, persists the `OptimizationRun` document in MongoDB, and pushes updates via Socket.IO.
- **Request Body (Optional overrides / target horizon):**
```json
{
  "horizon_hours": 24,
  "trigger_reason": "MANUAL_OPERATOR_REQUEST"
}
```
- **Response (200 OK):** `DispatchPlan` with cost breakdown, CO₂ emissions, reliability score, and engine reason codes.

### `GET /api/optimize/history`
Retrieves recent persisted optimization runs.

---

## 6. What-If Scenarios & Compare Plans (`/api/scenario`)

### `POST /api/scenario`
Injects an operational disruption scenario into the simulation/optimizer.
- **Request Body:**
```json
{
  "scenario_type": "WIND_DROP",
  "name": "Sudden Wind Stoppage",
  "parameters": {
    "wind_drop_pct": 80.0,
    "duration_hours": 6
  }
}
```
- **Response (200 OK):** Returns re-optimized dispatch plan, newly escalated ladder stage, and quantified delta metrics.

### `POST /api/scenario/compare`
Executes a multi-strategy comparison comparing the AI Optimal plan against baseline strategies:
1. `AI_OPTIMAL` (Dynamic LP/MILP)
2. `DIESEL_FIRST` (Baseline conventional diesel-dominant)
3. `RENEWABLE_FIRST_NO_STORAGE_OPTIMIZATION` (Greedy renewable dispatch)

- **Response (200 OK):**
```json
{
  "ai_optimal": { "cost_usd": 42.5, "co2_kg": 18.2, "diesel_liters": 6.8, "renewable_share_pct": 91.2, "reliability_pct": 100.0 },
  "diesel_first": { "cost_usd": 184.0, "co2_kg": 142.0, "diesel_liters": 52.6, "renewable_share_pct": 42.0, "reliability_pct": 100.0 },
  "renewable_first": { "cost_usd": 78.2, "co2_kg": 46.5, "diesel_liters": 17.2, "renewable_share_pct": 83.5, "reliability_pct": 96.5 }
}
```

---

## 7. Manual Operator Override (`/api/override`)

### `POST /api/override`
Forces specific asset constraints (e.g. force diesel ON, force minimum battery reserve).
- **Request Body:**
```json
{
  "force_diesel_on": true,
  "min_battery_reserve_pct": 50.0,
  "reason": "Pre-scheduled hospital surgery window"
}
```
- **Response (200 OK):** Returns updated state with quantified delta: `"this increases projected operating cost by $18.50 and CO₂ emissions by 14.2 kg."`

### `DELETE /api/override/clear`
Clears manual overrides and returns system to autonomous Autopilot optimization.

---

## 8. LLM Grounded Explainability (`/api/explain`)

### `POST /api/explain`
Generates a grounded, natural-language explanation of why the optimizer made specific decisions, using mathematical reason codes and constraints from the Python engine.
- **Request Body:**
```json
{
  "query": "Why was the diesel generator activated at 6:00 PM?",
  "run_id": "opt_run_12345"
}
```
- **Response (200 OK):**
```json
{
  "explanation": "At 18:00, solar irradiance drops to 0 W/m² and community demand surges to 110 kW (evening peak). Battery SoC is at 28% (near safety floor of 20%). The optimizer activated the diesel generator at its 80 kW thermal efficiency sweet spot (Stage 3) to prevent shedding Tier 2 and Tier 3 community loads while banking 12 kW excess into the battery.",
  "grounded_reason_codes": ["SOLAR_ZERO_NIGHT", "BATTERY_NEAR_RESERVE_FLOOR", "STAGE_3_EFFICIENT_DIESEL"],
  "metrics_referenced": {
    "diesel_output_kw": 80.0,
    "battery_soc_pct": 28.0,
    "demand_kw": 110.0
  }
}
```

---

## 9. Shortfall Ladder (`/api/ladder`)

### `GET /api/ladder`
Returns current shortfall status, active stage (0 through 4), and details of affected load tiers.

---

## 10. Fuel Runway (`/api/runway`)

### `GET /api/runway`
Returns projected days of diesel remaining and forward daily fuel consumption projections.

---

## 11. Socket.IO Real-Time Events (`namespace: /`)

Clients connect with auth handshake token:
`io("http://localhost:5000", { auth: { token: "<jwt>" } })`

### Emitted Events:
- `live_state_update`: Emitted on every orchestrator tick with the complete `CommunityState`.
- `optimization_update`: Emitted when an optimization run completes.
- `ladder_stage_changed`: Emitted when shortfall ladder stage escalates or de-escalates (0 to 4).
- `scenario_injected`: Emitted when a what-if event is triggered.
- `override_changed`: Emitted when an operator sets or clears a manual override.
- `signal_update`: Emitted when the traffic light status changes (`GREEN`, `YELLOW`, `RED`).
