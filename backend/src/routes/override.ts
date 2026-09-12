import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { orchestrator } from '../services/orchestrator';
import { OverrideEvent } from '../models/OverrideEvent';
import { liveStateBroadcaster } from '../sockets/liveState';
import { ManualOverrideSettings } from '../types';

const router = Router();

router.use(requireAuth);

const OverrideSchema = z.object({
  force_diesel_on: z.boolean().optional(),
  force_diesel_off: z.boolean().optional(),
  min_battery_reserve_pct: z.number().min(10).max(90).optional(),
  diesel_manual_kw: z.number().min(0).max(150).optional(),
  shed_tier4: z.boolean().optional(),
  reason: z.string().min(3, 'A clear operational reason is required for manual override'),
  community_id: z.string().optional().default('com-offgrid-01')
});

/**
 * POST /api/override
 * Applies a manual override to the microgrid dispatch
 */
router.post(
  '/',
  validateBody(OverrideSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const communityId = body.community_id || 'com-offgrid-01';

      const previousState = orchestrator.getLatestState() || {};

      const overrideSettings: ManualOverrideSettings = {
        force_diesel_on: body.force_diesel_on,
        force_diesel_off: body.force_diesel_off,
        min_battery_reserve_pct: body.min_battery_reserve_pct,
        diesel_manual_kw: body.diesel_manual_kw,
        shed_tier4: body.shed_tier4,
        reason: body.reason
      };

      // Set override in the orchestrator
      orchestrator.setOverride(overrideSettings);

      // Quantify operational impact
      let costDelta = 0;
      let co2Delta = 0;
      let explanation = 'Override active.';

      if (body.force_diesel_on) {
        costDelta = 32.40;
        co2Delta = 21.60;
        explanation = `Forcing diesel generator increases operating cost by ~$${costDelta.toFixed(2)} and emissions by ${co2Delta.toFixed(1)} kg CO2 per hour.`;
      } else if (body.force_diesel_off) {
        costDelta = -15.0;
        co2Delta = -10.0;
        explanation = 'Forcing diesel OFF eliminates fuel consumption, but increases risk of unserved load if battery depletes.';
      }

      // Persist Override Event
      const overrideRecord = await OverrideEvent.create({
        overrideId: `ovr_${Date.now()}`,
        operatorId: req.user?.userId || 'usr_operator',
        operatorEmail: req.user?.email || 'operator@gridpilot.org',
        communityId,
        previousState,
        overrideSettings,
        reason: body.reason,
        quantifiedImpact: {
          costDeltaUsd: costDelta,
          co2DeltaKg: co2Delta,
          reliabilityDeltaPct: 0,
          explanation
        },
        status: 'ACTIVE'
      });

      // Trigger orchestrator tick to re-evaluate with override
      const tickResult = await orchestrator.tick();

      // Emit override update
      liveStateBroadcaster.emitOverride({
        override: overrideRecord,
        active: true,
        settings: overrideSettings,
        impact: overrideRecord.quantifiedImpact
      });

      res.status(200).json({
        message: 'Manual override applied successfully',
        override: overrideRecord,
        quantified_impact: overrideRecord.quantifiedImpact,
        updated_state: tickResult.state
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/override/clear
 * Clears manual override and returns system to autonomous Autopilot optimization
 */
router.delete('/clear', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    orchestrator.setOverride(null);

    await OverrideEvent.updateMany(
      { communityId, status: 'ACTIVE' },
      { $set: { status: 'CLEARED' } }
    );

    const tickResult = await orchestrator.tick();

    liveStateBroadcaster.emitOverride({
      active: false,
      message: 'Autonomous Autopilot Mode Restored'
    });

    res.status(200).json({
      message: 'Manual override cleared. GridPilot Autopilot resumed.',
      updated_state: tickResult.state
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/override/history
 * Returns historical manual overrides
 */
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';
    const overrides = await OverrideEvent.find({ communityId }).sort({ timestamp: -1 }).limit(20);

    res.status(200).json({
      active_override: orchestrator.getActiveOverride(),
      history: overrides
    });
  } catch (err) {
    next(err);
  }
});

export default router;
