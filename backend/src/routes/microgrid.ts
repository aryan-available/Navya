import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { engineClient } from '../services/engineClient';
import { orchestrator } from '../services/orchestrator';
import { Community } from '../models/Community';

const router = Router();

// Guard all microgrid routes with JWT auth
router.use(requireAuth);

/**
 * GET /api/microgrid/state
 * Returns current live digital-twin state (solar, wind, battery, diesel, demand, shortfall stage)
 */
router.get('/state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    // Prioritize orchestrator cached state or fetch fresh from engineClient
    let state = orchestrator.getLatestState();
    if (!state || state.community_id !== communityId) {
      state = await engineClient.getLiveState(communityId);
    }

    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/microgrid/community
 * Returns community profile, targets, and locations
 */
router.get('/community', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    let community = await Community.findOne({ communityId });
    if (!community) {
      // Seed default community if not exists
      community = await Community.create({
        communityId,
        name: 'Kipawa Eco-Community Microgrid',
        location: {
          latitude: -1.2921,
          longitude: 36.8219,
          region: 'East Rift Valley Off-Grid Corridor',
          timezone: 'UTC+3'
        },
        demandProfileType: 'RURAL_COMMUNITY_MIXED',
        reliabilityTargets: {
          minUptimePct: 99.8,
          maxOutageHoursYear: 18
        }
      });
    }

    res.status(200).json({
      community_id: community.communityId,
      name: community.name,
      location: community.location?.region || 'Kijani Ridge',
      reliability_target_pct: community.reliabilityTargets?.minUptimePct ?? 99.5,
      population: 0
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/microgrid/assets
 * Returns configuration of Solar, Wind, Battery, and Diesel physical assets
 */
router.get('/assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.query.community_id as string) || 'com-offgrid-01';

    let community = await Community.findOne({ communityId });
    if (!community) {
      community = await Community.create({ communityId, name: 'Kipawa Eco-Community Microgrid' });
    }

    res.status(200).json(community.energyAssets);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/microgrid/parameters
 * Updates dynamic community parameters (e.g. diesel fuel price, battery reserve constraints)
 */
router.put('/parameters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const communityId = (req.body.community_id as string) || 'com-offgrid-01';
    const { energyAssets, reliabilityTargets } = req.body;

    const updated = await Community.findOneAndUpdate(
      { communityId },
      {
        $set: {
          ...(energyAssets ? { energyAssets } : {}),
          ...(reliabilityTargets ? { reliabilityTargets } : {})
        }
      },
      { new: true, upsert: true }
    );

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
