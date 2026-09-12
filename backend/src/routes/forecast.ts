import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { engineClient } from '../services/engineClient';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/forecast
 * Retrieves forward 24-72h predicted solar, wind, and per-tier demand curves from the engine
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const horizonHours = parseInt((req.query.horizon as string) || (req.query.horizon_hours as string) || '24', 10);
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    const forecast = await engineClient.getForecast(communityId, horizonHours);
    res.status(200).json(forecast);
  } catch (err) {
    next(err);
  }
});

export default router;
