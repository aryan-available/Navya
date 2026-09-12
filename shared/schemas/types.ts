/**
 * GridPilot Shared Schema & Types
 * Canonical TypeScript definitions matching shared contracts.
 */

export type LoadTierLevel = 1 | 2 | 3 | 4;

export enum LoadTier {
  TIER_1_CRITICAL = 1,  // Health clinic, vaccine storage, emergency comms (NEVER shed)
  TIER_2_IMPORTANT = 2, // Water pumping & filtration, sanitation
  TIER_3_STANDARD = 3,  // Schools, residential lighting, community center
  TIER_4_FLEXIBLE = 4   // EV charging, agricultural milling, non-urgent heavy tasks
}

export enum ShortfallStage {
  STAGE_0_EARLY_WARNING = 0,
  STAGE_1_PREEMPTIVE_PRECHARGE = 1,
  STAGE_2_DEFERRABLE_RESCHEDULE = 2,
  STAGE_3_EFFICIENT_DIESEL = 3,
  STAGE_4_FAIR_LOAD_SHEDDING = 4
}

export type SignalColor = 'GREEN' | 'YELLOW' | 'RED';

export interface WeatherState {
  irradiance_w_m2: number;
  cloud_cover_pct: number;
  wind_speed_m_s: number;
  temperature_c: number;
  condition?: string;
  source?: 'OPEN_METEO' | 'SYNTHETIC';
}

export interface GenerationState {
  solar_kw: number;
  wind_kw: number;
  battery_discharge_kw: number;
  diesel_kw: number;
  total_available_kw: number;
}

export interface BatteryState {
  soc_pct: number;
  capacity_kwh: number;
  stored_kwh: number;
  current_charge_kw: number;
  current_discharge_kw: number;
  max_charge_kw: number;
  max_discharge_kw: number;
  min_soc_pct: number;
  health_pct: number;
}

export interface DieselFuelState {
  fuel_remaining_liters: number;
  tank_capacity_liters: number;
  fuel_level_pct: number;
  status: 'OFF' | 'STARTING' | 'RUNNING' | 'COOLDOWN' | 'FAULT';
  rated_kw: number;
  min_load_kw: number;
  optimal_sweet_spot_kw: number;
  fuel_consumption_rate_l_per_kwh: number;
  fuel_price_per_liter: number;
}

export interface DemandBreakdown {
  tier1_critical_kw: number;
  tier2_important_kw: number;
  tier3_standard_kw: number;
  tier4_flexible_kw: number;
}

export interface DemandState {
  total_kw: number;
  tier_breakdown: DemandBreakdown;
}

export interface SignalState {
  color: SignalColor;
  message: string;
  updated_at: string;
}

export interface CommunityState {
  community_id: string;
  name: string;
  timestamp: string;
  weather: WeatherState;
  generation: GenerationState;
  battery: BatteryState;
  diesel: DieselFuelState;
  demand: DemandState;
  shortfall_stage: ShortfallStage;
  signal: SignalState;
}

export interface HourlyForecastItem {
  time: string;
  hour_offset: number;
  irradiance_w_m2: number;
  wind_speed_m_s: number;
  temp_c: number;
  predicted_solar_kw: number;
  predicted_wind_kw: number;
  total_demand_kw: number;
  tier1_critical_kw: number;
  tier2_important_kw: number;
  tier3_standard_kw: number;
  tier4_flexible_kw: number;
}

export interface ForecastData {
  horizon_hours: number;
  hourly_forecast: HourlyForecastItem[];
}

export interface DispatchInterval {
  time: string;
  solar_kw: number;
  wind_kw: number;
  battery_charge_kw: number;
  battery_discharge_kw: number;
  diesel_kw: number;
  curtailment_kw: number;
  served_load_kw: number;
  shed_load_kw: number;
  soc_pct: number;
}

export interface PlanMetrics {
  total_cost_usd: number;
  total_co2_kg: number;
  renewable_share_pct: number;
  diesel_liters_used: number;
  reliability_score_pct: number;
}

export interface DispatchPlan {
  plan_id: string;
  timestamp: string;
  horizon_hours: number;
  dispatches: DispatchInterval[];
  metrics: PlanMetrics;
  reason_codes: string[];
  shortfall_stage: ShortfallStage;
}

export interface LadderActionItem {
  tier: number;
  name: string;
  action: 'NORMAL' | 'PRECHARGING' | 'DEFERRED' | 'SHED';
  kw: number;
}

export interface LadderResponse {
  active_stage: ShortfallStage;
  stage_name: string;
  actions_taken: string[];
  loads_held_or_shed: LadderActionItem[];
  dispatch: DispatchPlan;
  reason_codes: string[];
}

export interface RunwayDailyProjection {
  day_offset: number;
  projected_diesel_liters_burned: number;
  remaining_liters: number;
  burn_rate_l_day: number;
}

export interface RunwayForecast {
  generated_at: string;
  community_id: string;
  days_of_diesel_remaining: number;
  daily_projections: RunwayDailyProjection[];
  status: 'CRITICAL' | 'WARNING' | 'SUFFICIENT';
}

export interface ScenarioEventPayload {
  scenario_type: 'CLOUD_COVER' | 'WIND_DROP' | 'BATTERY_FAULT' | 'DEMAND_SURGE' | 'DIESEL_PRICE_SPIKE' | 'CUSTOM';
  name: string;
  parameters: Record<string, any>;
  duration_hours?: number;
}

export interface StrategyPlanSummary {
  cost_usd: number;
  co2_kg: number;
  diesel_liters: number;
  renewable_share_pct: number;
  reliability_pct: number;
}

export interface ComparePlansResult {
  ai_optimal: StrategyPlanSummary;
  diesel_first: StrategyPlanSummary;
  renewable_first: StrategyPlanSummary;
}

export interface ManualOverrideSettings {
  force_diesel_on?: boolean;
  force_diesel_off?: boolean;
  min_battery_reserve_pct?: number;
  diesel_manual_kw?: number;
  shed_tier4?: boolean;
  reason: string;
}

export interface SafeUser {
  id: string;
  email: string;
  role: string;
  created_at?: string;
}
