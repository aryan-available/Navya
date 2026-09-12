/**
 * GridPilot Orchestrator Service
 *
 * Operational coordination layer in Node.js:
 * 1. Obtains current system state & forecast from Python engine
 * 2. Compares available renewable supply against demand
 * 3. Chooses Normal Path vs Shortfall Response Ladder
 * 4. Dispatches to engineClient
 * 5. Persists state & runs into MongoDB
 * 6. Pushes live updates to connected Socket.IO clients
 *
 * NOTE: The orchestrator does NOT do LP/MILP math. It coordinates data flow.
 */

import { engineClient } from './engineClient';
import { OptimizationRun } from '../models/OptimizationRun';
import { Community } from '../models/Community';
import { SignalStateModel } from '../models/SignalState';
import { OverrideEvent } from '../models/OverrideEvent';
import { liveStateBroadcaster } from '../sockets/liveState';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  CommunityState,
  DispatchPlan,
  LadderResponse,
  ShortfallStage,
  ForecastData,
  ManualOverrideSettings
} from '../types';

export class OrchestratorService {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private currentCommunityId = 'com-offgrid-01';
  private activeOverride: ManualOverrideSettings | null = null;
  private latestState: CommunityState | null = null;
  private latestDispatch: DispatchPlan | null = null;
  private latestLadder: LadderResponse | null = null;

  constructor() {
    logger.info('OrchestratorService initialized');
  }

  /**
   * Start periodic orchestrator loop
   */
  public start(intervalMs = env.ORCHESTRATOR_TICK_MS): void {
    if (this.timer) return;
    logger.info(`Starting Orchestrator loop (tick interval: ${intervalMs}ms)`);
    // Run initial tick immediately
    this.tick().catch((err) => logger.error('Error on initial orchestrator tick', err));

    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error('Error on scheduled orchestrator tick', err));
    }, intervalMs);
  }

  /**
   * Stop periodic orchestrator loop
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Stopped Orchestrator loop');
    }
  }

  /**
   * Set or update active manual override
   */
  public setOverride(override: ManualOverrideSettings | null): void {
    this.activeOverride = override;
    logger.info(`Manual override updated in Orchestrator: ${override ? override.reason : 'CLEARED'}`);
  }

  public getActiveOverride(): ManualOverrideSettings | null {
    return this.activeOverride;
  }

  public getLatestState(): CommunityState | null {
    return this.latestState;
  }

  public getLatestDispatch(): DispatchPlan | null {
    return this.latestDispatch;
  }

  public getLatestLadder(): LadderResponse | null {
    return this.latestLadder;
  }

  /**
   * Single Orchestrator Cycle Execution
   */
  public async tick(): Promise<{
    state: CommunityState;
    dispatch: DispatchPlan;
    ladder?: LadderResponse;
  }> {
    if (this.isTicking) {
      logger.debug('Orchestrator tick already in progress, skipping frame');
      return {
        state: this.latestState!,
        dispatch: this.latestDispatch!
      };
    }

    this.isTicking = true;
    try {
      // 1. Obtain live system state from engine
      const state = await engineClient.getLiveState(this.currentCommunityId);

      // Apply active manual override constraints to state if present
      if (this.activeOverride) {
        if (this.activeOverride.force_diesel_on) {
          state.diesel.status = 'RUNNING';
          state.generation.diesel_kw = this.activeOverride.diesel_manual_kw || state.diesel.optimal_sweet_spot_kw || 80.0;
        } else if (this.activeOverride.force_diesel_off) {
          state.diesel.status = 'OFF';
          state.generation.diesel_kw = 0;
        }
      }

      // 2. Obtain forward forecast
      const forecast: ForecastData = await engineClient.getForecast(this.currentCommunityId, 24);

      // 3. Check supply vs demand to determine Normal vs Shortfall Path
      const renewableSupply = state.generation.solar_kw + state.generation.wind_kw;
      const totalDemand = state.demand.total_kw;
      const batteryAvailable = Math.max(0, (state.battery.soc_pct - state.battery.min_soc_pct) / 100) * state.battery.capacity_kwh;
      const netInstantaneous = renewableSupply - totalDemand;

      let dispatchResult: DispatchPlan;
      let ladderResult: LadderResponse | undefined;

      // Escalation Evaluation Logic
      if (netInstantaneous >= 0 && batteryAvailable > 20) {
        // --- NORMAL PATH ---
        state.shortfall_stage = ShortfallStage.STAGE_0_EARLY_WARNING;
        dispatchResult = await engineClient.optimize({
          current_state: state,
          forecast,
          horizon_hours: 24,
          trigger_reason: this.activeOverride ? 'MANUAL_OVERRIDE_ACTIVE' : 'NORMAL_TICK_OPTIMIZATION'
        });
      } else {
        // --- SHORTFALL ESCALATION PATH ---
        let targetStage: ShortfallStage = ShortfallStage.STAGE_0_EARLY_WARNING;

        if (batteryAvailable > 30) {
          targetStage = ShortfallStage.STAGE_1_PREEMPTIVE_PRECHARGE;
        } else if (batteryAvailable > 15) {
          targetStage = ShortfallStage.STAGE_2_DEFERRABLE_RESCHEDULE;
        } else if (state.diesel.fuel_remaining_liters > 50) {
          targetStage = ShortfallStage.STAGE_3_EFFICIENT_DIESEL;
        } else {
          targetStage = ShortfallStage.STAGE_4_FAIR_LOAD_SHEDDING;
        }

        ladderResult = await engineClient.evaluateLadder({
  state,
  demand: state.demand,
  target_stage: targetStage
});

        state.shortfall_stage = ladderResult.active_stage;
        dispatchResult = ladderResult.dispatch;
      }

      this.latestState = state;
      this.latestDispatch = dispatchResult;
      this.latestLadder = ladderResult || null;

      // 4. Asynchronously Persist into MongoDB
      await this.persistTickData(state, dispatchResult, ladderResult);

      // 5. Emit live updates via Socket.IO
      liveStateBroadcaster.emitLiveState(state);
      liveStateBroadcaster.emitOptimization(dispatchResult);
      if (ladderResult) {
        liveStateBroadcaster.emitLadderUpdate(ladderResult);
      }
      liveStateBroadcaster.emitSignal(state.signal);

      return { state, dispatch: dispatchResult, ladder: ladderResult };
    } catch (error) {
      logger.error('Failed executing orchestrator tick', error);
      throw error;
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Persists snapshot data into MongoDB collections
   */
  private async persistTickData(
    state: CommunityState,
    dispatch: DispatchPlan,
    ladder?: LadderResponse
  ): Promise<void> {
    try {
      // 1. Record Optimization Run
      await OptimizationRun.create({
        runId: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date(),
        communityId: state.community_id,
        triggerReason: this.activeOverride ? 'OVERRIDE_EVALUATION' : (ladder ? `SHORTFALL_STAGE_${ladder.active_stage}` : 'AUTOPILOT_NORMAL'),
        horizonHours: dispatch.horizon_hours || 24,
        inputSnapshot: {
          weather: state.weather,
          battery: state.battery,
          diesel: state.diesel,
          demand: state.demand
        },
        dispatchPlan: dispatch,
        objectiveBreakdown: {
          totalCostUsd: dispatch.metrics?.total_cost_usd ?? 0,
          totalCo2Kg: dispatch.metrics?.total_co2_kg ?? 0,
          renewableSharePct: dispatch.metrics?.renewable_share_pct ?? 100,
          dieselLitersUsed: dispatch.metrics?.diesel_liters_used ?? 0,
          reliabilityScorePct: dispatch.metrics?.reliability_score_pct ?? 100
        },
        shortfallStage: state.shortfall_stage,
        reasonCodes: dispatch.reason_codes || [],
        executedBy: this.activeOverride ? 'OPERATOR_OVERRIDE' : 'AUTOPILOT'
      });

      // 2. Update Community Operational Snapshot
      await Community.findOneAndUpdate(
        { communityId: state.community_id },
        {
          $set: {
            currentOperationalState: state,
            name: state.name
          }
        },
        { upsert: true }
      );

      // 3. Record Signal State History
      await SignalStateModel.create({
        communityId: state.community_id,
        color: state.signal.color,
        message: state.signal.message,
        shortfallStage: state.shortfall_stage,
        timestamp: new Date()
      });
    } catch (err) {
      // Log persistence error without crashing the running live loop
      logger.warn('Failed saving tick data to MongoDB (may be operating offline/in-memory)', err);
    }
  }
}

export const orchestrator = new OrchestratorService();
