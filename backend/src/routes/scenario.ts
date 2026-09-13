import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { engineClient } from '../services/engineClient';
import { Scenario } from '../models/Scenario';
import { liveStateBroadcaster } from '../sockets/liveState';
import { ScenarioEventPayload } from '../types';

const router = Router();

router.use(requireAuth);

const ScenarioInjectSchema = z.object({
  scenario_type: z.enum(['CLOUD_COVER', 'WIND_DROP', 'BATTERY_FAULT', 'DEMAND_SURGE', 'DIESEL_PRICE_SPIKE', 'CUSTOM']),
  name: z.string().min(1, 'Scenario name is required'),
  parameters: z.record(z.any()).optional().default({}),
  duration_hours: z.number().positive().optional().default(6),
  community_id: z.string().optional().default('com-offgrid-01')
});

/**
 * POST /api/scenario
 * Injects a What-If disruption event into the engine simulator & triggers automatic re-optimization
 */
router.post(
  '/',
  validateBody(ScenarioInjectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: ScenarioEventPayload & { community_id: string } = req.body;

      // 1. Delegate event injection to the Python engine, then refresh and re-optimize.
      const engineEvent = await engineClient.injectEvent({
        ...payload,
        name: payload.scenario_type === 'BATTERY_FAULT' ? 'battery_failure' : payload.scenario_type.toLowerCase(),
        parameters: payload.parameters
      });
      const updatedState = await engineClient.getLiveState(payload.community_id);
      const forecast = await engineClient.getForecast(payload.community_id, 24);
      const reoptimized = await engineClient.optimize({ current_state: updatedState, forecast, horizon_hours: 24, trigger_reason: `scenario:${payload.scenario_type}` });
      const scenarioResult: any = {
        status: 'APPLIED',
        scenario_id: engineEvent?.event?.name ? `scen_${Date.now()}` : `scen_${Date.now()}`,
        message: `Scenario applied: ${payload.name}`,
        updated_state: updatedState,
        reoptimized_dispatch: reoptimized,
        cost_delta_usd: reoptimized.metrics.total_cost_usd,
        co2_delta_kg: reoptimized.metrics.total_co2_kg
      };

      // 2. Persist scenario in MongoDB
      const scenarioRecord = await Scenario.create({
        scenarioId: scenarioResult.scenario_id || `scen_${Date.now()}`,
        scenarioType: payload.scenario_type,
        name: payload.name,
        parameters: payload.parameters,
        status: 'APPLIED',
        communityId: payload.community_id || 'com-offgrid-01',
        impactMetrics: {
          costDeltaUsd: scenarioResult.cost_delta_usd ?? 0,
          co2DeltaKg: scenarioResult.co2_delta_kg ?? 0,
          reliabilityDeltaPct: 0
        }
      });

      // 3. Broadcast real-time what-if event & updated state to all connected clients
      liveStateBroadcaster.emitScenario(scenarioResult);
      liveStateBroadcaster.emitLiveState(scenarioResult.updated_state);
      if (scenarioResult.reoptimized_dispatch) {
        liveStateBroadcaster.emitOptimization(scenarioResult.reoptimized_dispatch);
      }
      if (scenarioResult.ladder_response) {
        liveStateBroadcaster.emitLadderUpdate(scenarioResult.ladder_response);
      }
      liveStateBroadcaster.emitSignal(scenarioResult.updated_state.signal);

      res.status(200).json(scenarioResult);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/scenario/list
 * Returns list of historical and preset scenarios
 */
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';
    const scenarios = await Scenario.find({ communityId }).sort({ timestamp: -1 }).limit(20);

    const presets = [
      { type: 'SUNNY_DAY', name: 'Sunny High Solar Day', description: 'Peak 120 kW solar irradiance with low wind' },
      { type: 'CLOUD_COVER', name: 'Sudden Cloud Cover', description: '85% solar irradiance drop within 15 minutes' },
      { type: 'WIND_DROP', name: 'Sudden Wind Drop', description: 'Wind collapses from 11 m/s to 1.5 m/s' },
      { type: 'BATTERY_FAULT', name: 'Battery Storage Fault', description: 'BMS fault isolates battery; grid requires instant diesel support' },
      { type: 'DEMAND_SURGE', name: 'Evening Community Peak Surge', description: 'Simultaneous EV charging + residential pump load surge +40 kW' },
      { type: 'DIESEL_PRICE_SPIKE', name: 'Diesel Price Surge (+50%)', description: 'Fuel cost increases from $1.45 to $2.18 per liter' }
    ];

    res.status(200).json({
      history: scenarios,
      presets
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/scenario/compare
 * Executes side-by-side strategy benchmark: AI-Optimal vs Diesel-First vs Renewable-First
 */
router.post('/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current_state = req.body?.current_state;
    const forecast = req.body?.forecast;
    const comparison = await engineClient.comparePlans({ current_state, forecast });
    res.status(200).json(comparison);
  } catch (err) {
    next(err);
  }
});

export default router;
