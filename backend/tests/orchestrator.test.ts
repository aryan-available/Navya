import { orchestrator } from '../src/services/orchestrator';
import { OptimizationRun } from '../src/models/OptimizationRun';
import { Community } from '../src/models/Community';
import './setup';

describe('Orchestrator Operational Coordination (Member B)', () => {
  it('executes a complete orchestrator tick (fetch, supply-vs-demand check, optimize, persist, broadcast)', async () => {
    const result = await orchestrator.tick();

    expect(result).toBeDefined();
    expect(result.state).toBeDefined();
    expect(result.dispatch).toBeDefined();
    expect(result.state.generation).toBeDefined();
    expect(result.state.demand).toBeDefined();

    // Verify tick persisted data into MongoDB
    const recentRun = await OptimizationRun.findOne().sort({ timestamp: -1 });
    expect(recentRun).toBeDefined();
    expect(recentRun?.dispatchPlan).toBeDefined();

    const communityDoc = await Community.findOne({ communityId: result.state.community_id });
    expect(communityDoc).toBeDefined();
    expect(communityDoc?.currentOperationalState).toBeDefined();
  });

  it('handles manual override inside the orchestrator flow', async () => {
    orchestrator.setOverride({
      force_diesel_on: true,
      diesel_manual_kw: 85.0,
      reason: 'Testing orchestrator override response'
    });

    const result = await orchestrator.tick();
    expect(result.state.generation.diesel_kw).toBe(85.0);
    expect(result.state.diesel.status).toBe('RUNNING');

    // Clean up override
    orchestrator.setOverride(null);
  });
});
