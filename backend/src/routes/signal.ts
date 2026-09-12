import { Router, Request, Response, NextFunction } from 'express';
import { engineClient } from '../services/engineClient';
import { orchestrator } from '../services/orchestrator';
import { SignalStateModel } from '../models/SignalState';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /signal
 *
 * CRITICAL REQUIREMENT:
 * This endpoint MUST be unauthenticated.
 * It is dedicated to low-power Community Display Kiosks (/community-display route)
 * and must be fast, cache-friendly, and fault-tolerant.
 */
router.get('/', async (req: Request, res: Response, _next: NextFunction) => {
  // Set cache headers for resilient kiosk polling (5 seconds cache)
  res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');

  try {
    // 1. Try to fetch the latest state from the in-memory orchestrator
    const latestState = orchestrator.getLatestState();
    if (latestState?.signal) {
      return res.status(200).json({
        color: latestState.signal.color,
        message: latestState.signal.message,
        updated_at: latestState.signal.updated_at
      });
    }

    // 2. Direct fetch from engineClient
    const signal = await engineClient.getSignal();
    return res.status(200).json({
      color: signal.color,
      message: signal.message,
      updated_at: signal.updated_at
    });
  } catch (err) {
    logger.warn('Failed live engine signal fetch, falling back to database cached signal', err);

    try {
      // 3. Graceful degradation: read latest persisted signal from MongoDB
      const cached = await SignalStateModel.findOne().sort({ timestamp: -1 });
      if (cached) {
        return res.status(200).json({
          color: cached.color,
          message: cached.message,
          updated_at: cached.timestamp.toISOString()
        });
      }
    } catch {
      // Fallback silently if db is down
    }

    // 4. Safe default fail-safe
    return res.status(200).json({
      color: 'GREEN',
      message: 'Grid operating autonomously. Signal cache fallback active.',
      updated_at: new Date().toISOString()
    });
  }
});

export default router;
