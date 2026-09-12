import request from 'supertest';
import { app } from '../src/index';
import { OptimizationRun } from '../src/models/OptimizationRun';
import './setup';

describe('Optimization API & Persistence (Member B)', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = { email: 'operator@gridpilot.org', password: 'Password123!' };
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app).post('/auth/login').send(user);
    authToken = loginRes.body.token;
  });

  it('triggers optimization, returns dispatch plan, and persists OptimizationRun in MongoDB', async () => {
    const res = await request(app)
      .post('/api/optimize')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        horizon_hours: 24,
        trigger_reason: 'TEST_DISPATCH_TRIGGER'
      });

    expect(res.status).toBe(200);
    expect(res.body.run_id).toBeDefined();
    expect(res.body.dispatch_plan).toBeDefined();
    expect(res.body.dispatch_plan.dispatches).toBeInstanceOf(Array);
    expect(res.body.dispatch_plan.dispatches.length).toBe(24);
    expect(res.body.dispatch_plan.metrics).toBeDefined();
    expect(res.body.dispatch_plan.reason_codes).toBeInstanceOf(Array);

    // Verify MongoDB document was persisted
    const savedRun = await OptimizationRun.findOne({ runId: res.body.run_id });
    expect(savedRun).toBeDefined();
    expect(savedRun?.triggerReason).toBe('TEST_DISPATCH_TRIGGER');
    expect(savedRun?.objectiveBreakdown).toBeDefined();
  });

  it('retrieves recent optimization run history from MongoDB', async () => {
    // Generate two runs
    await request(app).post('/api/optimize').set('Authorization', `Bearer ${authToken}`).send({});
    await request(app).post('/api/optimize').set('Authorization', `Bearer ${authToken}`).send({});

    const historyRes = await request(app)
      .get('/api/optimize/history')
      .set('Authorization', `Bearer ${authToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.total).toBeGreaterThanOrEqual(2);
    expect(historyRes.body.runs).toBeInstanceOf(Array);
  });
});
