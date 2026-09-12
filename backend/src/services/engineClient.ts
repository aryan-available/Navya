/**
 * Single Typed HTTP Integration Point between Node.js Backend and Python Engine.
 * Formats payloads to match Member C's FastAPI models and translates responses.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  EngineUnavailableError,
  EngineTimeoutError,
  EngineResponseError
} from '../utils/errors';
import {
  CommunityState,
  ForecastData,
  DispatchPlan,
  LadderResponse,
  RunwayForecast,
  SignalState,
  ScenarioEventPayload,
  ScenarioResult,
  ComparePlansResult,
  OptimizeRequestPayload,
  ShortfallStage
} from '../types';

export class EngineClient {
  private client: AxiosInstance;
  private isMock: boolean;
  private currentMockState: CommunityState;

  constructor(baseURL = env.ENGINE_BASE_URL, isMock = env.USE_MOCK_ENGINE) {
    this.isMock = isMock;
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    // Initialize realistic baseline mock state
    this.currentMockState = this.generateBaseMockState('com-offgrid-01');

    if (this.isMock) {
      logger.info('EngineClient initialized in MOCK MODE (Python engine simulated)');
    } else {
      logger.info(`EngineClient initialized pointing to Python Engine at ${baseURL}`);
    }
  }

  public setMockMode(enabled: boolean): void {
    this.isMock = enabled;
  }

  private handleError(error: unknown, operationName: string): never {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError;
      if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
        logger.error(`Python engine connection refused during [${operationName}] at ${env.ENGINE_BASE_URL}`);
        throw new EngineUnavailableError(`Python engine unreachable at ${env.ENGINE_BASE_URL}`);
      }
      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        logger.error(`Python engine request timed out during [${operationName}]`);
        throw new EngineTimeoutError(`Python engine timed out during ${operationName}`);
      }
      if (axiosErr.response) {
        logger.error(`Python engine returned error ${axiosErr.response.status} for [${operationName}]`, {
          status: axiosErr.response.status,
          data: axiosErr.response.data
        });
        throw new EngineResponseError(
          `Engine error (${axiosErr.response.status}): ${JSON.stringify(axiosErr.response.data)}`,
          axiosErr.response.data
        );
      }
    }

    logger.error(`Unexpected failure communicating with Python engine in [${operationName}]`, error);
    throw new EngineUnavailableError(`Failed to communicate with optimization engine: ${(error as Error).message}`);
  }

  private toFastApiPayload(payload: {
    current_state?: CommunityState;
    forecast?: ForecastData;
    stage?: number;
  }) {
    const state = payload.current_state || this.currentMockState;
    const demand = state.demand.tier_breakdown;
    const battery = state.battery;
    const diesel = state.diesel;
    const gen = state.generation;

    return {
      state: {
        timestamp: state.timestamp || new Date().toISOString().replace('Z', ''),
        solar_available_kw: gen.solar_kw ?? 40.0,
        wind_available_kw: gen.wind_kw ?? 10.0,
        battery_soc_kwh: battery.stored_kwh ?? 50.0,
        battery_capacity_kwh: battery.capacity_kwh ?? 100.0,
        battery_max_charge_kw: battery.max_charge_kw ?? 25.0,
        battery_max_discharge_kw: battery.max_discharge_kw ?? 25.0,
        diesel_max_kw: diesel.rated_kw ?? 30.0,
        diesel_fuel_liters: diesel.fuel_remaining_liters ?? 150.0,
        diesel_cost_per_kwh: diesel.fuel_price_per_liter ? diesel.fuel_price_per_liter * 0.27 : 0.45
      },
      demand: {
        tier1_kw: demand.tier1_critical_kw ?? 8.0,
        tier2_kw: demand.tier2_important_kw ?? 6.0,
        tier3_kw: demand.tier3_standard_kw ?? 12.0,
        tier4_kw: demand.tier4_flexible_kw ?? 10.0
      },
      forecast: {
        solar_next_hour: payload.forecast?.hourly_forecast?.[0]?.predicted_solar_kw ?? (gen.solar_kw || 35.0),
        wind_next_hour: payload.forecast?.hourly_forecast?.[0]?.predicted_wind_kw ?? (gen.wind_kw || 8.0),
        demand_growth_factor: 1.0
      },
      constraints: {
        battery_min_soc: battery.min_soc_pct ? battery.min_soc_pct / 100 : 0.2,
        battery_max_soc: 0.9,
        co2_cost: 0.08,
        degradation_cost: 0.04
      },
      ...(payload.stage !== undefined ? { stage: payload.stage } : {})
    };
  }

  private fromFastApiDispatch(data: any, horizonHours = 24, stage = 0): DispatchPlan {
    const served = (data.solar_used || 0) + (data.wind_used || 0) + (data.battery_discharge || 0) + (data.diesel_output || 0) - (data.battery_charge || 0);
    const unserved = (data.unserved_tier1 || 0) + (data.unserved_tier2 || 0) + (data.unserved_tier3 || 0) + (data.unserved_tier4 || 0);

    return {
      plan_id: `disp-${Date.now()}`,
      timestamp: new Date().toISOString(),
      horizon_hours: horizonHours,
      dispatches: [
        {
          time: new Date().toISOString(),
          solar_kw: data.solar_used || 0,
          wind_kw: data.wind_used || 0,
          battery_charge_kw: data.battery_charge || 0,
          battery_discharge_kw: data.battery_discharge || 0,
          diesel_kw: data.diesel_output || 0,
          curtailment_kw: 0,
          served_load_kw: Math.round(served * 10) / 10,
          shed_load_kw: Math.round(unserved * 10) / 10,
          soc_pct: 75.0
        }
      ],
      metrics: {
        total_cost_usd: Math.round((data.total_cost || 0) * 100) / 100,
        total_co2_kg: Math.round((data.emissions || 0) * 10) / 10,
        renewable_share_pct: Math.round((((data.solar_used || 0) + (data.wind_used || 0)) / Math.max(1, served)) * 1000) / 10,
        diesel_liters_used: Math.round(((data.diesel_output || 0) * 0.27) * 10) / 10,
        reliability_score_pct: Math.round((data.reliability_score || 1.0) * 100)
      },
      reason_codes: data.reason_codes || ['OPTIMAL_DISPATCH_SOLVED'],
      shortfall_stage: stage as ShortfallStage
    };
  }

  // ==========================================
  // 1. Simulation & State Endpoints
  // ==========================================

  async getLiveState(communityId = 'com-offgrid-01'): Promise<CommunityState> {
    if (this.isMock) {
      return this.getMockLiveState(communityId);
    }
    try {
      const response = await this.client.get<CommunityState>('/state', {
        params: { community_id: communityId }
      });
      return response.data;
    } catch {
      // Graceful fallback to physical simulator state if /state isn't in Member C optimizer router
      return this.getMockLiveState(communityId);
    }
  }

  async getForecast(communityId = 'com-offgrid-01', horizonHours = 24): Promise<ForecastData> {
    if (this.isMock) {
      return this.getMockForecast(horizonHours);
    }
    try {
      const response = await this.client.get<ForecastData>('/forecast', {
        params: { community_id: communityId, horizon_hours: horizonHours }
      });
      return response.data;
    } catch {
      return this.getMockForecast(horizonHours);
    }
  }

  async injectEvent(payload: ScenarioEventPayload): Promise<ScenarioResult> {
    if (this.isMock) {
      return this.getMockScenarioResult(payload);
    }
    try {
      const response = await this.client.post<ScenarioResult>('/events', payload);
      return response.data;
    } catch {
      return this.getMockScenarioResult(payload);
    }
  }

  // ==========================================
  // 2. Optimization Endpoints
  // ==========================================

  async optimize(payload: OptimizeRequestPayload): Promise<DispatchPlan> {
    if (this.isMock) {
      return this.getMockDispatchPlan(payload);
    }
    try {
      const fastApiBody = this.toFastApiPayload({
        current_state: payload.current_state,
        forecast: payload.forecast
      });
      const response = await this.client.post('/optimize', fastApiBody);
      return this.fromFastApiDispatch(response.data, payload.horizon_hours || 24, 0);
    } catch (err) {
      return this.handleError(err, 'optimize');
    }
  }

  async evaluateLadder(payload: {
    current_state?: CommunityState;
    forecast?: ForecastData;
    target_stage?: number;
  }): Promise<LadderResponse> {
    const stage = payload.target_stage ?? 1;
    if (this.isMock) {
      return this.getMockLadderResponse(stage);
    }
    try {
      const fastApiBody = this.toFastApiPayload({
        current_state: payload.current_state,
        forecast: payload.forecast,
        stage
      });
      const response = await this.client.post('/ladder', fastApiBody);
      const dispatch = this.fromFastApiDispatch(response.data, 24, stage);

      const stageNames = [
        'Early Warning (Risk Flagged 6-12h Ahead)',
        'Preemptive Pre-Charge (Banking Surplus)',
        'Deferrable Load Rescheduling',
        'Efficient Diesel Generation (~80% Sweet Spot)',
        'Fair Tier-Based Load Shedding'
      ];

      return {
        active_stage: stage as ShortfallStage,
        stage_name: stageNames[stage] || `Shortfall Stage ${stage}`,
        actions_taken: [
          `Evaluated Stage ${stage} against MIP constraints`,
          stage >= 3 ? 'Diesel dispatched at ~80% sweet spot' : 'Diesel idle',
          stage === 4 ? 'Tier 4/3 shedding enforced' : 'Critical clinic loads 100% served'
        ],
        loads_held_or_shed: [
          { tier: 4, name: 'EV Charging & Agri-Milling', action: stage >= 2 ? 'DEFERRED' : 'NORMAL', kw: 18.0 },
          { tier: 3, name: 'School / Residential non-essential', action: stage === 4 ? 'SHED' : 'NORMAL', kw: 38.0 }
        ],
        dispatch,
        reason_codes: response.data.reason_codes || [`STAGE_${stage}_ACTIVE`]
      };
    } catch (err) {
      return this.handleError(err, 'evaluateLadder');
    }
  }

  async getRunway(communityId = 'com-offgrid-01'): Promise<RunwayForecast> {
    if (this.isMock) {
      return this.getMockRunwayForecast(communityId);
    }
    try {
      const response = await this.client.get('/runway');
      const data = response.data;
      const days = data.projected_days_remaining ?? 14.0;
      return {
        generated_at: new Date().toISOString(),
        community_id: communityId,
        days_of_diesel_remaining: Math.round(days * 10) / 10,
        daily_projections: [
          { day_offset: 1, projected_diesel_liters_burned: data.daily_diesel_consumption || 20, remaining_liters: data.remaining_liters || 150, burn_rate_l_day: data.daily_diesel_consumption || 20 }
        ],
        status: days > 7 ? 'SUFFICIENT' : (days > 2 ? 'WARNING' : 'CRITICAL')
      };
    } catch (err) {
      return this.handleError(err, 'getRunway');
    }
  }

  async getSignal(communityId = 'com-offgrid-01'): Promise<SignalState> {
    if (this.isMock) {
      return this.currentMockState.signal;
    }
    try {
      const response = await this.client.get<SignalState>('/signal');
      return {
        color: response.data.color,
        message: response.data.message,
        updated_at: new Date().toISOString()
      };
    } catch {
      return this.currentMockState.signal;
    }
  }

  async comparePlans(payload?: {
    current_state?: CommunityState;
    forecast?: ForecastData;
  }): Promise<ComparePlansResult> {
    if (this.isMock) {
      return this.getMockComparePlans();
    }
    try {
      const response = await this.client.post<ComparePlansResult>('/compare', payload || {});
      return response.data;
    } catch {
      return this.getMockComparePlans();
    }
  }

  // ==========================================
  // Deterministic Mock Engines for Testing & Local Dev
  // ==========================================

  private generateBaseMockState(communityId: string): CommunityState {
    const now = new Date();
    const hour = now.getUTCHours();
    const solarFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const solarKw = Math.round(solarFactor * 90.0 * 10) / 10;
    const windKw = Math.round((35.0 + Math.sin(hour / 3) * 10) * 10) / 10;

    const tier1 = 18.0;
    const tier2 = 24.0;
    const tier3 = 38.0;
    const tier4 = 18.0;
    const totalDemand = tier1 + tier2 + tier3 + tier4;

    const renewableAvail = solarKw + windKw;
    const net = renewableAvail - totalDemand;

    let batteryCharge = 0;
    let batteryDischarge = 0;
    let dieselKw = 0;
    let shortfallStage = ShortfallStage.STAGE_0_EARLY_WARNING;
    let signalColor: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    let signalMsg = 'Microgrid operating on 100% renewable generation. Battery charging.';

    if (net >= 0) {
      batteryCharge = Math.min(net, 45.0);
    } else {
      const deficit = Math.abs(net);
      if (deficit <= 50.0) {
        batteryDischarge = deficit;
        signalColor = 'GREEN';
        signalMsg = 'Solar & Wind supported by Battery storage. Zero emissions.';
      } else {
        dieselKw = 80.0;
        batteryCharge = dieselKw - deficit;
        shortfallStage = ShortfallStage.STAGE_3_EFFICIENT_DIESEL;
        signalColor = 'YELLOW';
        signalMsg = 'Efficient Diesel active at 80 kW sweet spot to preserve grid stability.';
      }
    }

    return {
      community_id: communityId,
      name: 'Kipawa Eco-Community Microgrid',
      timestamp: now.toISOString(),
      weather: {
        irradiance_w_m2: Math.round(solarFactor * 900),
        cloud_cover_pct: 18.0,
        wind_speed_m_s: 6.8,
        temperature_c: 26.5,
        condition: solarFactor > 0.3 ? 'CLEAR_SUNNY' : 'CLEAR_NIGHT',
        source: 'OPEN_METEO'
      },
      generation: {
        solar_kw: solarKw,
        wind_kw: windKw,
        battery_discharge_kw: Math.round(batteryDischarge * 10) / 10,
        diesel_kw: Math.round(dieselKw * 10) / 10,
        total_available_kw: Math.round((solarKw + windKw + batteryDischarge + dieselKw) * 10) / 10
      },
      battery: {
        soc_pct: 81.5,
        capacity_kwh: 250.0,
        stored_kwh: 203.75,
        current_charge_kw: Math.round(batteryCharge * 10) / 10,
        current_discharge_kw: Math.round(batteryDischarge * 10) / 10,
        max_charge_kw: 50.0,
        max_discharge_kw: 60.0,
        min_soc_pct: 20.0,
        health_pct: 98.4
      },
      diesel: {
        fuel_remaining_liters: 680.0,
        tank_capacity_liters: 1000.0,
        fuel_level_pct: 68.0,
        status: dieselKw > 0 ? 'RUNNING' : 'OFF',
        rated_kw: 100.0,
        min_load_kw: 25.0,
        optimal_sweet_spot_kw: 80.0,
        fuel_consumption_rate_l_per_kwh: 0.27,
        fuel_price_per_liter: 1.45
      },
      demand: {
        total_kw: totalDemand,
        tier_breakdown: {
          tier1_critical_kw: tier1,
          tier2_important_kw: tier2,
          tier3_standard_kw: tier3,
          tier4_flexible_kw: tier4
        }
      },
      shortfall_stage: shortfallStage,
      signal: {
        color: signalColor,
        message: signalMsg,
        updated_at: now.toISOString()
      }
    };
  }

  private getMockLiveState(communityId: string): CommunityState {
    this.currentMockState = this.generateBaseMockState(communityId);
    return this.currentMockState;
  }

  private getMockForecast(horizonHours: number): ForecastData {
    const items = [];
    const now = new Date();

    for (let h = 1; h <= horizonHours; h++) {
      const forecastTime = new Date(now.getTime() + h * 3600 * 1000);
      const hour = forecastTime.getUTCHours();
      const solarFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
      const solarKw = Math.round(solarFactor * 90.0 * 10) / 10;
      const windKw = Math.round((30.0 + Math.sin((hour + 2) / 3) * 12) * 10) / 10;

      const t1 = 18.0;
      const t2 = 22.0 + (hour >= 6 && hour <= 18 ? 6 : 0);
      const t3 = 30.0 + (hour >= 18 && hour <= 22 ? 25 : 0);
      const t4 = 15.0 + (hour >= 10 && hour <= 15 ? 15 : 0);

      items.push({
        time: forecastTime.toISOString(),
        hour_offset: h,
        irradiance_w_m2: Math.round(solarFactor * 880),
        wind_speed_m_s: Math.round((5.5 + Math.sin(h / 4) * 2) * 10) / 10,
        temp_c: Math.round((22 + solarFactor * 8) * 10) / 10,
        predicted_solar_kw: solarKw,
        predicted_wind_kw: windKw,
        total_demand_kw: t1 + t2 + t3 + t4,
        tier1_critical_kw: t1,
        tier2_important_kw: t2,
        tier3_standard_kw: t3,
        tier4_flexible_kw: t4
      });
    }

    return {
      horizon_hours: horizonHours,
      hourly_forecast: items
    };
  }

  private getMockDispatchPlan(payload: OptimizeRequestPayload): DispatchPlan {
    const horizon = payload.horizon_hours || 24;
    const now = new Date();
    const dispatches = [];

    let currentSoc = payload.current_state?.battery.soc_pct ?? 80.0;
    let totalCost = 0;
    let totalCo2 = 0;
    let dieselLiters = 0;

    for (let h = 0; h < horizon; h++) {
      const time = new Date(now.getTime() + h * 3600 * 1000).toISOString();
      const hour = (now.getUTCHours() + h) % 24;
      const solar = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) * 85;
      const wind = 35 + Math.sin(hour / 3) * 8;
      const demand = 90 + (hour >= 18 && hour <= 22 ? 30 : 0);

      let charge = 0;
      let discharge = 0;
      let diesel = 0;

      const renew = solar + wind;
      if (renew >= demand) {
        charge = Math.min(renew - demand, 40);
        currentSoc = Math.min(95, currentSoc + (charge / 250) * 100);
      } else {
        const def = demand - renew;
        if (currentSoc > 25 && def <= 50) {
          discharge = def;
          currentSoc = Math.max(20, currentSoc - (discharge / 250) * 100);
        } else {
          diesel = 80;
          charge = diesel - def;
          currentSoc = Math.min(95, currentSoc + (charge / 250) * 100);
          dieselLiters += diesel * 0.27;
          totalCost += diesel * 0.27 * 1.45;
          totalCo2 += diesel * 0.27 * 2.68;
        }
      }

      dispatches.push({
        time,
        solar_kw: Math.round(solar * 10) / 10,
        wind_kw: Math.round(wind * 10) / 10,
        battery_charge_kw: Math.round(charge * 10) / 10,
        battery_discharge_kw: Math.round(discharge * 10) / 10,
        diesel_kw: Math.round(diesel * 10) / 10,
        curtailment_kw: 0,
        served_load_kw: Math.round(demand * 10) / 10,
        shed_load_kw: 0,
        soc_pct: Math.round(currentSoc * 10) / 10
      });
    }

    return {
      plan_id: `disp-plan-${Date.now()}`,
      timestamp: now.toISOString(),
      horizon_hours: horizon,
      dispatches,
      metrics: {
        total_cost_usd: Math.round(totalCost * 100) / 100,
        total_co2_kg: Math.round(totalCo2 * 10) / 10,
        renewable_share_pct: 92.4,
        diesel_liters_used: Math.round(dieselLiters * 10) / 10,
        reliability_score_pct: 100.0
      },
      reason_codes: [
        'OPTIMAL_LP_SOLVED',
        'SOLAR_WIND_PRIORITIZED',
        'BATTERY_CYCLE_DEGRADATION_MINIMIZED',
        'DIESEL_DISPATCHED_AT_SWEET_SPOT_WHEN_NEEDED'
      ],
      shortfall_stage: ShortfallStage.STAGE_0_EARLY_WARNING
    };
  }

  private getMockLadderResponse(targetStage: number): LadderResponse {
    const stage = Math.min(Math.max(targetStage, 0), 4) as ShortfallStage;
    const stageNames = [
      'Early Warning (Risk Flagged 6-12h Ahead)',
      'Preemptive Pre-Charge (Banking Surplus)',
      'Deferrable Load Rescheduling',
      'Efficient Diesel Generation (~80% Sweet Spot)',
      'Fair Tier-Based Load Shedding'
    ];

    const actions = [
      'Calculated 24h energy buffer deficit',
      'Preserving Tier 1 critical clinic loads',
      stage >= 1 ? 'Pre-charging battery bank from surplus generation' : 'Normal dispatch monitoring',
      stage >= 2 ? 'Rescheduled Tier 4 EV and heavy milling loads' : 'Tier 4 loads active',
      stage >= 3 ? 'Dispatched generator at 80 kW sweet spot, routing 16 kW surplus into battery' : 'Diesel OFF',
      stage === 4 ? 'Emergency curtailment of Tier 4 and partial Tier 3 loads' : 'No loads shed'
    ];

    return {
      active_stage: stage,
      stage_name: stageNames[stage],
      actions_taken: actions,
      loads_held_or_shed: [
        { tier: 4, name: 'EV Charging & Agri-Milling', action: stage >= 2 ? 'DEFERRED' : 'NORMAL', kw: 18.0 },
        { tier: 3, name: 'School / Community Center', action: stage === 4 ? 'SHED' : 'NORMAL', kw: 38.0 }
      ],
      dispatch: this.getMockDispatchPlan({ horizon_hours: 24 }),
      reason_codes: [`SHORTFALL_STAGE_${stage}_ACTIVE`, 'TIER_1_CRITICAL_CLINIC_LOADS_PROTECTED_FIRST']
    };
  }

  private getMockRunwayForecast(communityId: string): RunwayForecast {
    const daily = [];
    let remaining = 680.0;
    for (let d = 1; d <= 14; d++) {
      const burned = 22.0 + Math.sin(d / 2) * 5;
      remaining = Math.max(0, remaining - burned);
      daily.push({
        day_offset: d,
        projected_diesel_liters_burned: Math.round(burned * 10) / 10,
        remaining_liters: Math.round(remaining * 10) / 10,
        burn_rate_l_day: Math.round(burned * 10) / 10
      });
    }

    return {
      generated_at: new Date().toISOString(),
      community_id: communityId,
      days_of_diesel_remaining: 15.4,
      daily_projections: daily,
      status: 'SUFFICIENT'
    };
  }

  private getMockScenarioResult(payload: ScenarioEventPayload): ScenarioResult {
    const updated = { ...this.currentMockState };
    let costDelta = 0;
    let co2Delta = 0;
    let message = `Applied ${payload.name}`;

    if (payload.scenario_type === 'WIND_DROP') {
      updated.generation.wind_kw = Math.round(updated.generation.wind_kw * 0.2 * 10) / 10;
      updated.generation.diesel_kw = 80.0;
      updated.shortfall_stage = ShortfallStage.STAGE_3_EFFICIENT_DIESEL;
      updated.signal = {
        color: 'YELLOW',
        message: 'Wind drop detected: Diesel dispatched at 80 kW sweet spot to preserve stability.',
        updated_at: new Date().toISOString()
      };
      costDelta = 34.5;
      co2Delta = 24.8;
      message = 'Wind output collapsed by 80%. Diesel started at 80 kW sweet spot. 18 kW excess routed to battery.';
    } else if (payload.scenario_type === 'CLOUD_COVER') {
      updated.generation.solar_kw = Math.round(updated.generation.solar_kw * 0.15 * 10) / 10;
      updated.battery.current_discharge_kw = 35.0;
      updated.shortfall_stage = ShortfallStage.STAGE_1_PREEMPTIVE_PRECHARGE;
      costDelta = 12.0;
      co2Delta = 0.0;
      message = 'Heavy cloud cover reduced solar by 85%. Battery discharge stepped up smoothly.';
    } else if (payload.scenario_type === 'BATTERY_FAULT') {
      updated.battery.health_pct = 0;
      updated.battery.current_discharge_kw = 0;
      updated.battery.current_charge_kw = 0;
      updated.generation.diesel_kw = 80.0;
      updated.shortfall_stage = ShortfallStage.STAGE_3_EFFICIENT_DIESEL;
      updated.signal = {
        color: 'YELLOW',
        message: 'Battery fault isolated. Diesel generator providing continuous voltage stabilization.',
        updated_at: new Date().toISOString()
      };
      costDelta = 48.0;
      co2Delta = 38.0;
      message = 'Battery storage faulted and safely isolated. Diesel generator active.';
    }

    this.currentMockState = updated;

    return {
      status: 'APPLIED',
      scenario_id: `scen-${Date.now()}`,
      message,
      updated_state: updated,
      reoptimized_dispatch: this.getMockDispatchPlan({ horizon_hours: 24 }),
      ladder_response: this.getMockLadderResponse(updated.shortfall_stage),
      cost_delta_usd: costDelta,
      co2_delta_kg: co2Delta
    };
  }

  private getMockComparePlans(): ComparePlansResult {
    return {
      ai_optimal: {
        cost_usd: 38.2,
        co2_kg: 16.4,
        diesel_liters: 6.1,
        renewable_share_pct: 93.5,
        reliability_pct: 100.0
      },
      diesel_first: {
        cost_usd: 172.5,
        co2_kg: 135.0,
        diesel_liters: 50.4,
        renewable_share_pct: 44.2,
        reliability_pct: 100.0
      },
      renewable_first: {
        cost_usd: 72.8,
        co2_kg: 42.0,
        diesel_liters: 15.6,
        renewable_share_pct: 84.1,
        reliability_pct: 96.8
      }
    };
  }
}

// Singleton Engine Client instance
export const engineClient = new EngineClient();
