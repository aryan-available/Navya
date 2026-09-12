# GridPilot Engine Contract (Node.js ⇄ Python FastAPI Engine)

This document defines the strict HTTP interface between the **Node.js API Gateway (Member B)** and the **Python Engine (Members C & D)**.

The Python engine runs on `ENGINE_BASE_URL` (e.g. `http://localhost:8000`).

---

## 1. Simulation & State Endpoints (Member D)

### `GET /state`
Returns the current physically-simulated live microgrid state.
- **Query Params:** `community_id` (optional, default `default`)
- **Response (200 OK):**
```json
{
  "community_id": "default",
  "timestamp": "2026-09-12T09:00:00Z",
  "weather": {
    "irradiance_w_m2": 780.0,
    "cloud_cover_pct": 20.0,
    "wind_speed_m_s": 6.5,
    "temperature_c": 25.0,
    "condition": "PARTLY_CLOUDY"
  },
  "generation": {
    "solar_kw": 78.0,
    "wind_kw": 38.0,
    "battery_discharge_kw": 0.0,
    "diesel_kw": 0.0,
    "total_available_kw": 116.0
  },
  "battery": {
    "soc_pct": 82.0,
    "capacity_kwh": 250.0,
    "stored_kwh": 205.0,
    "current_charge_kw": 18.0,
    "current_discharge_kw": 0.0,
    "max_charge_kw": 50.0,
    "max_discharge_kw": 60.0,
    "min_soc_pct": 20.0,
    "health_pct": 98.0
  },
  "diesel": {
    "fuel_remaining_liters": 650.0,
    "tank_capacity_liters": 1000.0,
    "fuel_level_pct": 65.0,
    "status": "OFF",
    "rated_kw": 100.0,
    "min_load_kw": 25.0,
    "optimal_sweet_spot_kw": 80.0,
    "fuel_consumption_rate_l_per_kwh": 0.27,
    "fuel_price_per_liter": 1.45
  },
  "demand": {
    "total_kw": 98.0,
    "tier_breakdown": {
      "tier1_critical_kw": 18.0,
      "tier2_important_kw": 25.0,
      "tier3_standard_kw": 38.0,
      "tier4_flexible_kw": 17.0
    }
  },
  "shortfall_stage": 0,
  "signal": {
    "color": "GREEN",
    "message": "Microgrid operating on 100% renewable generation. Battery charging.",
    "updated_at": "2026-09-12T09:00:00Z"
  }
}
```

### `GET /forecast`
Returns forward 24h to 72h forecasted weather and demand profiles.
- **Query Params:** `horizon_hours` (integer, default 24), `community_id` (optional)
- **Response (200 OK):**
```json
{
  "horizon_hours": 24,
  "hourly_forecast": [
    {
      "time": "2026-09-12T10:00:00Z",
      "hour_offset": 1,
      "irradiance_w_m2": 850.0,
      "wind_speed_m_s": 7.0,
      "temp_c": 27.0,
      "predicted_solar_kw": 85.0,
      "predicted_wind_kw": 40.0,
      "total_demand_kw": 95.0,
      "tier1_critical_kw": 18.0,
      "tier2_important_kw": 25.0,
      "tier3_standard_kw": 35.0,
      "tier4_flexible_kw": 17.0
    }
  ]
}
```

### `POST /events`
Injects an environmental or equipment disruption into the simulator.
- **Request Body:**
```json
{
  "event_type": "WIND_DROP",
  "intensity": 0.8,
  "duration_hours": 6,
  "parameters": { "wind_speed_reduction_pct": 80 }
}
```
- **Response (200 OK):**
```json
{
  "status": "APPLIED",
  "event_id": "evt_9988",
  "message": "Wind speed reduced by 80% for 6 hours",
  "updated_state": { /* CommunityState */ }
}
```

---

## 2. Optimization Endpoints (Member C)

### `POST /optimize`
Solves the rolling LP/MILP dispatch optimization problem.
- **Request Body:**
```json
{
  "current_state": { /* CommunityState */ },
  "forecast": { /* Forecast Object */ },
  "constraints": {
    "force_diesel": false,
    "min_battery_reserve_pct": 20.0,
    "max_diesel_kw": 100.0
  },
  "horizon_hours": 24
}
```
- **Response (200 OK):**
```json
{
  "plan_id": "disp-20260912-0900",
  "timestamp": "2026-09-12T09:00:00Z",
  "horizon_hours": 24,
  "dispatches": [
    {
      "time": "2026-09-12T09:00:00Z",
      "solar_kw": 78.0,
      "wind_kw": 38.0,
      "battery_charge_kw": 18.0,
      "battery_discharge_kw": 0.0,
      "diesel_kw": 0.0,
      "curtailment_kw": 0.0,
      "served_load_kw": 98.0,
      "shed_load_kw": 0.0,
      "soc_pct": 82.0
    }
  ],
  "metrics": {
    "total_cost_usd": 14.50,
    "total_co2_kg": 0.0,
    "renewable_share_pct": 100.0,
    "diesel_liters_used": 0.0,
    "reliability_score_pct": 100.0
  },
  "reason_codes": [
    "RENEWABLE_SURPLUS_AVAILABLE",
    "BATTERY_CHARGING_SURPLUS",
    "DIESEL_OFF"
  ],
  "shortfall_stage": 0
}
```

### `POST /ladder`
Evaluates the 5-Stage Shortfall Response Ladder.
- **Request Body:**
```json
{
  "current_state": { /* CommunityState */ },
  "forecast": { /* Forecast Object */ },
  "target_stage": 3
}
```
- **Response (200 OK):**
```json
{
  "active_stage": 3,
  "stage_name": "Efficient Diesel Generation",
  "actions_taken": [
    "Diesel spun up to 80.0 kW (sweet spot)",
    "Excess 14.0 kW routed to recharge battery buffer",
    "All Tier 1-3 loads fully served",
    "Tier 4 flexible loads deferred"
  ],
  "loads_held_or_shed": [
    { "tier": 4, "name": "EV Charging / Agricultural Milling", "action": "DEFERRED", "kw": 17.0 }
  ],
  "dispatch": { /* DispatchPlan */ },
  "reason_codes": [
    "SHORTFALL_PREDICTED_STAGE_3",
    "DIESEL_DISPATCHED_AT_SWEET_SPOT_80KW",
    "TIER_4_FLEXIBLE_DEFERRED"
  ]
}
```

### `GET /runway`
Calculates forward fuel runway projection based on rolling dispatch.
- **Response (200 OK):**
```json
{
  "generated_at": "2026-09-12T09:00:00Z",
  "community_id": "default",
  "days_of_diesel_remaining": 14.2,
  "daily_projections": [
    { "day_offset": 1, "projected_diesel_liters_burned": 22.5, "remaining_liters": 627.5, "burn_rate_l_day": 22.5 },
    { "day_offset": 2, "projected_diesel_liters_burned": 35.0, "remaining_liters": 592.5, "burn_rate_l_day": 35.0 }
  ],
  "status": "SUFFICIENT"
}
```

### `GET /signal`
Returns the distilled traffic light state.
- **Response (200 OK):**
```json
{
  "color": "GREEN",
  "message": "Microgrid operating on 100% renewable generation. Battery charging.",
  "updated_at": "2026-09-12T09:00:00Z"
}
```

### `POST /compare`
Computes comparative performance between AI-Optimal, Diesel-First, and Renewable-First strategies.
- **Request Body:**
```json
{
  "current_state": { /* CommunityState */ },
  "forecast": { /* Forecast Object */ }
}
```
- **Response (200 OK):**
```json
{
  "ai_optimal": { "cost_usd": 42.5, "co2_kg": 18.2, "diesel_liters": 6.8, "renewable_share_pct": 91.2, "reliability_pct": 100.0 },
  "diesel_first": { "cost_usd": 184.0, "co2_kg": 142.0, "diesel_liters": 52.6, "renewable_share_pct": 42.0, "reliability_pct": 100.0 },
  "renewable_first": { "cost_usd": 78.2, "co2_kg": 46.5, "diesel_liters": 17.2, "renewable_share_pct": 83.5, "reliability_pct": 96.5 }
}
```
