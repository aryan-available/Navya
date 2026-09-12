/**
 * contracts.ts
 * Auto-synchronized TypeScript interfaces matching shared/schemas/simulation_models.py
 * For use across Frontend (React+Vite) and Backend (Node.js/Express)
 */

export enum LoadTier {
  CRITICAL = 1,
  IMPORTANT = 2,
  HOMES = 3,
  FLEXIBLE = 4,
}

export interface WeatherState {
  timestamp: string;
  ghi_w_m2: number;
  wind_speed_m_s: number;
  temperature_c: number;
  cloud_cover_pct: number;
  source: 'live' | 'synthetic';
}

export interface WeatherForecastPoint {
  timestamp: string;
  ghi_w_m2?: number;
  wind_speed_m_s?: number;
  output_kw: number;
}

export interface WeatherForecast {
  generated_at: string;
  horizon_hours: number;
  points: WeatherForecastPoint[];
  confidence: number[];
}

export interface DemandPoint {
  timestamp: string;
  tier: LoadTier;
  load_kw: number;
  label: string;
}

export interface DemandForecastPoint {
  timestamp: string;
  total_kw: number;
  by_tier: Record<number, number>;
}

export interface DemandForecast {
  generated_at: string;
  horizon_hours: number;
  points: DemandForecastPoint[];
  confidence: number[];
}

export interface BatteryState {
  timestamp: string;
  soc_pct: number;
  capacity_kwh: number;
  charge_rate_kw: number;
  health_pct: number;
}

export interface RefuelRecord {
  timestamp: string;
  liters: number;
}

export interface DieselFuelState {
  timestamp: string;
  fuel_remaining_l: number;
  tank_capacity_l: number;
  consumption_rate_l_per_kwh: number;
  generator_on: boolean;
  current_load_kw: number;
  last_refuel_at?: string | null;
  refuel_history: RefuelRecord[];
}

export type ScenarioName =
  | 'cloud_cover'
  | 'wind_drop'
  | 'demand_surge'
  | 'battery_failure'
  | 'diesel_price_spike';

export interface ScenarioEvent {
  name: ScenarioName;
  triggered_at: string;
  magnitude: number;
  duration_hours: number;
  metadata: Record<string, any>;
}

export interface SimulationState {
  timestamp: string;
  solar_output_kw: number;
  wind_output_kw: number;
  total_renewable_kw: number;
  demand: {
    total_kw: number;
    by_tier: Record<number, number>;
    blocks: Array<{ label: string; tier: number; load_kw: number }>;
  };
  battery: BatteryState;
  diesel: DieselFuelState;
  weather: WeatherState;
  active_scenario: ScenarioEvent | null;
  system_balance_kw: number;
}
