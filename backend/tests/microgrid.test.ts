import request from 'supertest';
import { app } from '../src/index';
import './setup';

describe('Microgrid API Endpoints (Member B)', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = { email: 'operator@gridpilot.org', password: 'Password123!' };
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app).post('/auth/login').send(user);
    authToken = loginRes.body.token;
  });

  it('retrieves live digital twin state via GET /api/microgrid/state', async () => {
    const res = await request(app)
      .get('/api/microgrid/state')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.community_id).toBeDefined();
    expect(res.body.generation).toBeDefined();
    expect(res.body.battery).toBeDefined();
    expect(res.body.diesel).toBeDefined();
    expect(res.body.demand).toBeDefined();
    expect(res.body.demand.tier_breakdown).toBeDefined();
    expect(res.body.demand.tier_breakdown.tier1_critical_kw).toBeGreaterThan(0);
  });

  it('retrieves community metadata via GET /api/microgrid/community', async () => {
    const res = await request(app)
      .get('/api/microgrid/community')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.communityId).toBe('com-offgrid-01');
    expect(res.body.name).toBeDefined();
    expect(res.body.reliabilityTargets).toBeDefined();
  });

  it('retrieves assets specs via GET /api/microgrid/assets', async () => {
    const res = await request(app)
      .get('/api/microgrid/assets')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.solar).toBeDefined();
    expect(res.body.wind).toBeDefined();
    expect(res.body.battery).toBeDefined();
    expect(res.body.diesel).toBeDefined();
  });
});
