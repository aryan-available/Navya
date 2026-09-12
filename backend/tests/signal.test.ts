import request from 'supertest';
import { app } from '../src/index';
import './setup';

describe('Public Signal Route for Community Display (Member B)', () => {
  it('allows unauthenticated access to GET /signal without JWT', async () => {
    const res = await request(app).get('/signal');

    expect(res.status).toBe(200);
    expect(res.body.color).toBeDefined();
    expect(['GREEN', 'YELLOW', 'RED']).toContain(res.body.color);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.updated_at).toBeDefined();
    // Cache header verify
    expect(res.headers['cache-control']).toBeDefined();
  });
});
