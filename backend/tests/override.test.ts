import request from 'supertest';
import { app } from '../src/index';
import { OverrideEvent } from '../src/models/OverrideEvent';
import './setup';

describe('Manual Operator Override (Member B)', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = { email: 'operator@gridpilot.org', password: 'Password123!' };
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app).post('/auth/login').send(user);
    authToken = loginRes.body.token;
  });

  it('applies manual override and persists OverrideEvent with quantified impact', async () => {
    const res = await request(app)
      .post('/api/override')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        force_diesel_on: true,
        diesel_manual_kw: 80.0,
        min_battery_reserve_pct: 40.0,
        reason: 'Emergency clinic vaccination cooling backup'
      });

    expect(res.status).toBe(200);
    expect(res.body.override).toBeDefined();
    expect(res.body.quantified_impact).toBeDefined();
    expect(res.body.quantified_impact.costDeltaUsd).toBeGreaterThan(0);

    const saved = await OverrideEvent.findOne({ status: 'ACTIVE' });
    expect(saved).toBeDefined();
    expect(saved?.reason).toContain('Emergency clinic');
  });

  it('clears manual override and resumes Autopilot mode', async () => {
    // Set override
    await request(app).post('/api/override').set('Authorization', `Bearer ${authToken}`).send({
      force_diesel_on: true,
      reason: 'Temporary test override'
    });

    // Clear override
    const clearRes = await request(app)
      .delete('/api/override/clear')
      .set('Authorization', `Bearer ${authToken}`);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.message).toContain('Autopilot resumed');

    const activeOverrides = await OverrideEvent.find({ status: 'ACTIVE' });
    expect(activeOverrides.length).toBe(0);
  });
});
