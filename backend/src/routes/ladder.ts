import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { engineClient } from '../services/engineClient';
import { orchestrator } from '../services/orchestrator';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/ladder
 * Returns the current Shortfall Response Ladder status, active stage (0-4), actions, and affected tiers
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latestLadder = orchestrator.getLatestLadder();
    const latestState = orchestrator.getLatestState();

    if (latestLadder) {
      return res.status(200).json(latestLadder);
    }

    // Otherwise request fresh evaluation from engineClient
    const currentStage = latestState?.shortfall_stage ?? 0;
    const ladder = await engineClient.evaluateLadder({
      current_state: latestState || undefined,
      target_stage: currentStage
    });

    res.status(200).json(ladder);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ladder/recalculate
 * Forces a re-evaluation of the shortfall ladder with a specific target stage
 */
router.post('/recalculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { target_stage } = req.body;
    const state = orchestrator.getLatestState();
    const forecast = await engineClient.getForecast();

    const ladder = await engineClient.evaluateLadder({
      current_state: state || undefined,
      forecast,
      target_stage: target_stage ?? 1
    });

    res.status(200).json(ladder);
  } catch (err) {
    next(err);
  }
});

export default router;
