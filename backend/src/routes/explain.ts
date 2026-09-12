import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { llmClient } from '../services/llmClient';
import { orchestrator } from '../services/orchestrator';
import { OptimizationRun } from '../models/OptimizationRun';

const router = Router();

router.use(requireAuth);

const ExplainSchema = z.object({
  query: z.string().optional().default('Explain the current optimization rationale and dispatch decision.'),
  run_id: z.string().optional(),
  community_id: z.string().optional().default('com-offgrid-01')
});

/**
 * POST /api/explain
 *
 * CRITICAL RULE:
 * The LLM is ONLY an explanation layer.
 * It is supplied with the exact optimizer output, reason codes, and constraints.
 * It is never permitted to invent numbers or compute alternative dispatch values.
 */
router.post(
  '/',
  validateBody(ExplainSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, run_id, community_id } = req.body;

      let currentState = orchestrator.getLatestState();
      let dispatchPlan = orchestrator.getLatestDispatch();
      let shortfallStage = currentState?.shortfall_stage;
      let reasonCodes: string[] = dispatchPlan?.reason_codes || [];
      let metrics = dispatchPlan?.metrics || {};

      // If a specific historical run_id was provided, look it up in MongoDB
      if (run_id) {
        const historicalRun = await OptimizationRun.findOne({ runId: run_id });
        if (historicalRun) {
          dispatchPlan = historicalRun.dispatchPlan as any;
          shortfallStage = historicalRun.shortfallStage;
          reasonCodes = historicalRun.reasonCodes || [];
          metrics = historicalRun.objectiveBreakdown || {};
        }
      }

      const explanationResult = await llmClient.explainDecision({
        query,
        currentState: currentState || undefined,
        dispatchPlan: dispatchPlan || undefined,
        shortfallStage,
        reasonCodes,
        metrics
      });

      res.status(200).json(explanationResult);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
