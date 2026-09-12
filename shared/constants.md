# GridPilot Shared Constants & Physical Parameters

This document specifies the authoritative constants, unit standards, and operational limits across the GridPilot system.

## 1. Electrical Units
- **Power**: Kilowatts ($kW$)
- **Energy**: Kilowatt-hours ($kWh$)
- **Voltage**: Nominal AC Microgrid bus (400V 3-phase / 230V 1-phase)
- **Frequency**: 50 Hz

## 2. Default Microgrid Asset Sizing
- **Solar PV Array**:
  - Nameplate Capacity: `100.0 kW`
  - Reference Irradiance (STC): `1000.0 W/m²`
  - Panel Nominal Efficiency: `20.0%`
- **Wind Turbine**:
  - Rated Capacity: `30.0 kW`
  - Cut-in Speed: `3.0 m/s`
  - Rated Speed: `12.0 m/s`
  - Cut-out Speed: `25.0 m/s`
- **Battery Storage (BESS)**:
  - Nominal Pack Capacity: `100.0 kWh`
  - Maximum Charge C-Rate: `0.5C` (`50.0 kW`)
  - Maximum Discharge C-Rate: `0.5C` (`50.0 kW`)
  - Minimum SOC Limit: `10.0%` (Hardware deep-discharge cutoff)
  - Maximum SOC Limit: `95.0%` (Overcharge safety margin)
  - Default Initial SOC: `60.0%`
  - Round-Trip Efficiency: `~90%` (`95%` charge, `95%` discharge)
  - Self-Discharge Rate: `0.02% / hour`
- **Diesel Generator**:
  - Rated Capacity: `50.0 kW`
  - Fuel Tank Capacity: `2,000.0 Liters`
  - Optimal Efficiency Point: `~80% load` (`0.28 L/kWh`)
  - Idling / Low-load Penalty: `< 30% load` (`1.6x` multiplier = `0.448 L/kWh`)

## 3. Load Tiers & Priority Hierarchy
| Tier | Name | Priority | Typical Loads | Shedding Order |
|---|---|---|---|---|
| **1** | **CRITICAL** | Highest | Health clinic fridges, emergency monitors, water pump station | **Never shed** (protected at Stage 4) |
| **2** | **IMPORTANT** | High | Schools, daytime admin, street lighting | Shed only after Tiers 3 & 4 |
| **3** | **HOMES** | Medium | Residential lighting, household appliances | Shed in rotation at Stage 4 |
| **4** | **FLEXIBLE** | Low | EV charging bank, small industrial milling, deferrable tasks | First to hold (Stage 1) and shed (Stage 4) |

## 4. Geographic & Weather Baseline
- **Default Microgrid Location**: Pune rural outskirts, Maharashtra, India
  - Latitude: `18.5204`
  - Longitude: `73.8567`
  - Timezone: `Asia/Kolkata`
- **Weather Provider**: Open-Meteo API (free tier, no key required) with automatic fallback to synthetic diurnal model when offline.

## 5. What-If Scenarios
| Scenario ID | Physical Effect | Default Severity | Default Duration |
|---|---|---|---|
| `cloud_cover` | Drops solar irradiance via cloud attenuation | `70%` cloud cover | 3 hours |
| `wind_drop` | Suppresses atmospheric wind speed | `60%` drop (40% remaining) | 4 hours |
| `demand_surge` | Multiplies load (system-wide or Tier 4 EV) | `+50%` load | 2 hours |
| `battery_failure`| Drops available battery capacity | `100%` trip (full bank offline) | 6 hours |
| `diesel_price_spike` | Increases diesel cost factor in optimizer | `+80%` fuel price | 48 hours |
