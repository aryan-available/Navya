# Shared Schemas & Data Contracts (GRIDPILOT)

This directory serves as the **Single Source of Truth** for data contracts shared between:
- **Member A (Frontend)**: TypeScript types
- **Member B (Backend)**: TypeScript interfaces, Zod schemas, Mongoose models
- **Member C (Optimizer)**: Python Pydantic models (LP/MILP dispatch, ladder, runway)
- **Member D (Simulation)**: Python Pydantic models (weather, generation, battery/diesel physical models)

---

## 1. Load Tier & Shortfall Stage Enums

### Load Tiers (`LoadTier`)
- `1`: **Critical / Clinic** (Health center, vaccine refrigeration, emergency comms — **NEVER SHED**)
- `2`: **Important** (Water pumping, clean water filtration, essential community loads)
- `3`: **Homes & School** (Standard household lighting, school daytime power, local shops)
- `4`: **Flexible / Deferrable** (EV charging, agricultural milling, water heating, deferrable heavy machinery)

### Shortfall Stages (`ShortfallStage`)
- `0`: **Normal / Early Warning** (Flag shortfall risk 6–12h ahead; monitor reserve thresholds)
- `1`: **Preemptive Pre-Charge** (Bank surplus renewables now, hold Tier 4 deferrable loads)
- `2`: **Deferrable Reschedule** (Actively shift flexible tasks into upcoming surplus windows)
- `3`: **Efficient Diesel Generation** (Run diesel generator at ~80% thermal efficiency sweet spot, store excess into battery)
- `4`: **Fair Tier-Based Load Shedding** (Progressively curtail loads in strict priority: Tier 4 → Tier 3 → Tier 2; Tier 1 protected last)

### Traffic Signal State (`SignalColor`)
- `GREEN`: Grid fully stable, renewable generation or battery reserves sufficient, fuel runway healthy (> 7 days).
- `YELLOW`: Caution / Shortfall ladder active (Stages 1–3), battery reserve low or fuel runway diminishing (2–7 days).
- `RED`: Critical / Stage 4 load shedding active, generator failure, or fuel runway < 48 hours.

---

## 2. Core Entities Schema Overview

### `CommunityState`
```json
{
  "community_id": "com-offgrid-01",
  "name": "Kipawa Eco-Community",
  "timestamp": "2026-09-12T09:00:00Z",
  "weather": {
    "irradiance_w_m2": 820.5,
    "cloud_cover_pct": 15.0,
    "wind_speed_m_s": 7.4,
    "temperature_c": 26.2,
    "condition": "CLEAR_SUNNY"
  },
  "generation": {
    "solar_kw": 85.4,
    "wind_kw": 42.1,
    "battery_discharge_kw": 0.0,
    "diesel_kw": 0.0,
    "total_available_kw": 127.5
  },
  "battery": {
    "soc_pct": 78.5,
    "capacity_kwh": 250.0,
    "stored_kwh": 196.25,
    "current_charge_kw": 22.3,
    "current_discharge_kw": 0.0,
    "max_charge_kw": 50.0,
    "max_discharge_kw": 60.0,
    "min_soc_pct": 20.0,
    "health_pct": 98.2
  },
  "diesel": {
    "fuel_remaining_liters": 680.0,
    "tank_capacity_liters": 1000.0,
    "fuel_level_pct": 68.0,
    "status": "OFF",
    "rated_kw": 100.0,
    "min_load_kw": 25.0,
    "optimal_sweet_spot_kw": 80.0,
    "fuel_consumption_rate_l_per_kwh": 0.27,
    "fuel_price_per_liter": 1.45
  },
  "demand": {
    "total_kw": 105.2,
    "tier_breakdown": {
      "tier1_critical_kw": 18.5,
      "tier2_important_kw": 25.0,
      "tier3_standard_kw": 42.7,
      "tier4_flexible_kw": 19.0
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

### `DispatchPlan` (Engine LP/MILP Output)
```json
{
  "plan_id": "disp-20260912-0900",
  "timestamp": "2026-09-12T09:00:00Z",
  "horizon_hours": 24,
  "dispatches": [
    {
      "time": "2026-09-12T09:00:00Z",
      "solar_kw": 85.4,
      "wind_kw": 42.1,
      "battery_charge_kw": 22.3,
      "battery_discharge_kw": 0.0,
      "diesel_kw": 0.0,
      "curtailment_kw": 0.0,
      "served_load_kw": 105.2,
      "shed_load_kw": 0.0,
      "soc_pct": 78.5
    }
  ],
  "metrics": {
    "total_cost_usd": 12.40,
    "total_co2_kg": 0.0,
    "renewable_share_pct": 100.0,
    "diesel_liters_used": 0.0,
    "reliability_score_pct": 100.0
  },
  "reason_codes": [
    "RENEWABLE_SURPLUS_AVAILABLE",
    "BATTERY_ABSORBING_EXCESS_SOLAR",
    "DIESEL_UNNECESSARY_ZERO_EMISSIONS"
  ],
  "shortfall_stage": 0
}
```

### `RunwayForecast`
```json
{
  "generated_at": "2026-09-12T09:00:00Z",
  "community_id": "com-offgrid-01",
  "days_of_diesel_remaining": 14.2,
  "daily_projections": [
    { "day_offset": 1, "projected_diesel_liters_burned": 22.5, "remaining_liters": 657.5, "burn_rate_l_day": 22.5 },
    { "day_offset": 2, "projected_diesel_liters_burned": 35.0, "remaining_liters": 622.5, "burn_rate_l_day": 35.0 }
  ],
  "status": "SUFFICIENT"
}
```
