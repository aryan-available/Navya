import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { engineClient } from '../services/engineClient';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/runway
 * Returns the forward fuel-runway forecast (days of diesel remaining & per-day projected burn rate)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';
    const runway = await engineClient.getRunway(communityId);
    res.status(200).json(runway);
  } catch (err) {
    next(err);
  }
});

export default router;
