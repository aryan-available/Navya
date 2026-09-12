import request from 'supertest';
import { app } from '../src/index';
import './setup';

describe('Ladder, Runway, and Grounded Explainability (Member B)', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = { email: 'operator@gridpilot.org', password: 'Password123!' };
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app).post('/auth/login').send(user);
    authToken = loginRes.body.token;
  });

  it('retrieves Shortfall Response Ladder status via GET /api/ladder', async () => {
    const res = await request(app)
      .get('/api/ladder')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.active_stage).toBeDefined();
    expect(res.body.stage_name).toBeDefined();
    expect(res.body.actions_taken).toBeInstanceOf(Array);
    expect(res.body.loads_held_or_shed).toBeInstanceOf(Array);
  });

  it('retrieves Fuel Runway forecast via GET /api/runway', async () => {
    const res = await request(app)
      .get('/api/runway')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.days_of_diesel_remaining).toBeGreaterThan(0);
    expect(res.body.daily_projections).toBeInstanceOf(Array);
    expect(res.body.daily_projections.length).toBeGreaterThan(0);
  });

  it('generates grounded mathematical explanation via POST /api/explain', async () => {
    const res = await request(app)
      .post('/api/explain')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        query: 'Why is diesel active or idle right now?'
      });

    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeDefined();
    expect(typeof res.body.explanation).toBe('string');
    expect(res.body.grounded_reason_codes).toBeInstanceOf(Array);
    expect(res.body.metrics_referenced).toBeDefined();
  });
});
