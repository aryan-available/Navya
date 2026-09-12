import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { engineClient } from '../services/engineClient';
import { OptimizationRun } from '../models/OptimizationRun';
import { liveStateBroadcaster } from '../sockets/liveState';
import { OptimizeRequestPayload } from '../types';

const router = Router();

router.use(requireAuth);

/**
 * POST /api/optimize
 * Triggers LP/MILP optimization in Python engine, persists run record, broadcasts update
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload: OptimizeRequestPayload = req.body || {};
    const communityId = payload.current_state?.community_id || 'com-offgrid-01';

    // If current_state was not provided by frontend, fetch latest live state
    if (!payload.current_state) {
      payload.current_state = await engineClient.getLiveState(communityId);
    }
    if (!payload.forecast) {
      payload.forecast = await engineClient.getForecast(communityId, payload.horizon_hours || 24);
    }

    // Delegate dispatch math strictly to the Python engine
    const dispatchPlan = await engineClient.optimize(payload);

    // Persist run in MongoDB
    const run = await OptimizationRun.create({
      runId: dispatchPlan.plan_id || `run_${Date.now()}`,
      timestamp: new Date(),
      communityId,
      triggerReason: payload.trigger_reason || 'MANUAL_OPERATOR_DISPATCH_REQUEST',
      horizonHours: payload.horizon_hours || 24,
      inputSnapshot: {
        weather: payload.current_state.weather,
        battery: payload.current_state.battery,
        diesel: payload.current_state.diesel,
        demand: payload.current_state.demand
      },
      forecastSnapshot: payload.forecast,
      dispatchPlan,
      objectiveBreakdown: {
        totalCostUsd: dispatchPlan.metrics?.total_cost_usd ?? 0,
        totalCo2Kg: dispatchPlan.metrics?.total_co2_kg ?? 0,
        renewableSharePct: dispatchPlan.metrics?.renewable_share_pct ?? 100,
        dieselLitersUsed: dispatchPlan.metrics?.diesel_liters_used ?? 0,
        reliabilityScorePct: dispatchPlan.metrics?.reliability_score_pct ?? 100
      },
      shortfallStage: dispatchPlan.shortfall_stage ?? payload.current_state.shortfall_stage ?? 0,
      reasonCodes: dispatchPlan.reason_codes || [],
      executedBy: req.user?.email || 'user'
    });

    // Broadcast optimization update to live UI
    liveStateBroadcaster.emitOptimization(dispatchPlan);

    res.status(200).json({
      run_id: run.runId,
      dispatch_plan: dispatchPlan
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/optimize/history
 * Returns recent optimization runs
 */
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    const runs = await OptimizationRun.find({ communityId })
      .sort({ timestamp: -1 })
      .limit(limit);

    res.status(200).json({
      total: runs.length,
      runs
    });
  } catch (err) {
    next(err);
  }
});

export default router;
