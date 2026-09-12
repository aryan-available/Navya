import request from 'supertest';
import { app } from '../src/index';
import { Scenario } from '../src/models/Scenario';
import './setup';

describe('What-If Scenarios & Compare Plans (Member B)', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = { email: 'operator@gridpilot.org', password: 'Password123!' };
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app).post('/auth/login').send(user);
    authToken = loginRes.body.token;
  });

  it('injects a WIND_DROP what-if scenario and persists Scenario in MongoDB', async () => {
    const res = await request(app)
      .post('/api/scenario')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        scenario_type: 'WIND_DROP',
        name: 'Storm Wind Cutoff',
        parameters: { wind_drop_pct: 80 }
      });

    expect(res.status).toBe(200);
    expect(res.body.scenario).toBeDefined();
    expect(res.body.result).toBeDefined();
    expect(res.body.result.updated_state.generation.diesel_kw).toBeGreaterThanOrEqual(0);

    const saved = await Scenario.findOne({ scenarioType: 'WIND_DROP' });
    expect(saved).toBeDefined();
    expect(saved?.name).toBe('Storm Wind Cutoff');
  });

  it('retrieves preset and historical scenarios via GET /api/scenario/list', async () => {
    const res = await request(app)
      .get('/api/scenario/list')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.presets).toBeInstanceOf(Array);
    expect(res.body.presets.length).toBeGreaterThan(0);
    expect(res.body.history).toBeInstanceOf(Array);
  });

  it('runs Compare Plans comparing AI-Optimal vs Diesel-First vs Renewable-First', async () => {
    const res = await request(app)
      .post('/api/scenario/compare')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ai_optimal).toBeDefined();
    expect(res.body.diesel_first).toBeDefined();
    expect(res.body.renewable_first).toBeDefined();

    // AI Optimal should be cheaper than Diesel First
    expect(res.body.ai_optimal.cost_usd).toBeLessThan(res.body.diesel_first.cost_usd);
    // AI Optimal should have lower emissions than Diesel First
    expect(res.body.ai_optimal.co2_kg).toBeLessThan(res.body.diesel_first.co2_kg);
  });
});
