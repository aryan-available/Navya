# Node ⇄ Python Engine HTTP Contract

**Service**: `gridpilot-engine` (FastAPI)
**Default Port**: `http://localhost:8000`

This document defines the HTTP API exposed by the Python Engine's Simulation & Forecasting module (Member D), consumed by Member B (Node.js backend orchestrator) and Member C (Optimization router).

---

## 1. Endpoints Overview

| Method | Path | Description | Consumer |
|---|---|---|---|
| `GET` | `/state` (alias `/simulation/state`) | Returns current live microgrid snapshot (generation, load by tier, battery, diesel, weather, active scenario) | Node Backend, Digital Twin |
| `GET` | `/forecast` (alias `/simulation/forecast`) | Forward 24h/72h projections for solar, wind, and demand by tier with confidence vectors | Node Backend, Forecast Timeline |
| `POST` | `/events` (alias `/simulation/events`) | Triggers a What-If scenario event (cloud cover, wind drop, demand surge, battery failure, price spike) | Node Backend, What-If Sandbox |
| `POST` | `/simulation/battery/step` | Advances battery state by requested kW for `step_hours` | Member C Optimizer, Backend |
| `POST` | `/simulation/diesel/step` | Advances diesel fuel consumption by dispatched kW for `step_hours` | Member C Optimizer, Backend |
| `POST` | `/simulation/diesel/refuel` | Records a diesel fuel delivery | Node Backend |
| `POST` | `/simulation/reset` | Resets all active scenarios and restores nominal operational state | Node Backend |

---

## 2. Request & Response Specifications

### `GET /state`
Returns the instantaneous live snapshot of the off-grid community microgrid.

**Response `200 OK`**:
```json
{
  "timestamp": "2026-09-12T12:00:00.000Z",
  "solar_output_kw": 68.4,
  "wind_output_kw": 18.2,
  "total_renewable_kw": 86.6,
  "demand": {
    "total_kw": 58.2,
    "by_tier": {
      "1": 13.0,
      "2": 9.0,
      "3": 24.2,
      "4": 12.0
    },
    "blocks": [
      { "label": "clinic", "tier": 1, "load_kw": 8.0 },
      { "label": "water_pump_station", "tier": 1, "load_kw": 5.0 },
      { "label": "household_block_1", "tier": 3, "load_kw": 8.1 }
    ]
  },
  "battery": {
    "timestamp": "2026-09-12T12:00:00.000Z",
    "soc_pct": 62.4,
    "capacity_kwh": 100.0,
    "charge_rate_kw": 20.0,
    "health_pct": 100.0
  },
  "diesel": {
    "timestamp": "2026-09-12T12:00:00.000Z",
    "fuel_remaining_l": 1850.5,
    "tank_capacity_l": 2000.0,
    "consumption_rate_l_per_kwh": 0.0,
    "generator_on": false,
    "current_load_kw": 0.0,
    "last_refuel_at": null,
    "refuel_history": []
  },
  "weather": {
    "timestamp": "2026-09-12T12:00:00.000Z",
    "ghi_w_m2": 684.0,
    "wind_speed_m_s": 8.5,
    "temperature_c": 27.2,
    "cloud_cover_pct": 15.0,
    "source": "live"
  },
  "active_scenario": null,
  "system_balance_kw": 28.4
}
```

---

### `GET /forecast`
Generates forward projections over a selectable horizon (24 or 72 hours).

**Query Parameters**:
- `horizon_hours` (int, optional, default: `24`): `24` or `72`
- `step_minutes` (int, optional, default: `60`): time interval between steps
- `lat` (float, optional, default: `18.52`)
- `lon` (float, optional, default: `73.85`)

**Response `200 OK`**:
```json
{
  "generated_at": "2026-09-12T12:00:00.000Z",
  "horizon_hours": 24,
  "step_minutes": 60,
  "solar": {
    "generated_at": "2026-09-12T12:00:00.000Z",
    "horizon_hours": 24,
    "points": [
      { "timestamp": "2026-09-12T12:00:00.000Z", "ghi_w_m2": 684.0, "output_kw": 68.4 }
    ],
    "confidence": [0.95, 0.93, 0.91]
  },
  "wind": {
    "generated_at": "2026-09-12T12:00:00.000Z",
    "horizon_hours": 24,
    "points": [
      { "timestamp": "2026-09-12T12:00:00.000Z", "wind_speed_m_s": 8.5, "output_kw": 18.2 }
    ],
    "confidence": [0.90, 0.86, 0.82]
  },
  "demand": {
    "generated_at": "2026-09-12T12:00:00.000Z",
    "horizon_hours": 24,
    "points": [
      {
        "timestamp": "2026-09-12T12:00:00.000Z",
        "total_kw": 58.2,
        "by_tier": { "1": 13.0, "2": 9.0, "3": 24.2, "4": 12.0 }
      }
    ],
    "confidence": [0.97, 0.96, 0.95]
  }
}
```

---

### `POST /events`
Injects an operational disruption or weather anomaly.

**Request Body**:
```json
{
  "name": "cloud_cover",
  "severity": 85.0,
  "duration_hours": 3.0
}
```
*Allowed names*:
- `"cloud_cover"`: `severity` = 0-100 (% clouds)
- `"wind_drop"`: `severity` = 0.0-1.0 (fraction speed dropped)
- `"demand_surge"`: `severity` = fractional increase (e.g. 0.5 = +50%), `tier` = optional target tier
- `"battery_failure"`: `severity` = capacity offline fraction (1.0 = total bank down)
- `"diesel_price_spike"`: `severity` = cost multiplier increase (e.g. 0.8 = +80%)

**Response `200 OK`**:
```json
{
  "status": "injected",
  "event": {
    "name": "cloud_cover",
    "triggered_at": "2026-09-12T12:05:00.000Z",
    "magnitude": 0.85,
    "duration_hours": 3.0,
    "metadata": { "cloud_cover_pct": 85.0 }
  }
}
```
