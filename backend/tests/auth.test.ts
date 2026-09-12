import request from 'supertest';
import { app } from '../src/index';
import './setup';

describe('Authentication & JWT System (Member B)', () => {
  const testUser = {
    email: 'operator1@gridpilot.org',
    password: 'SecurePassword123!',
    role: 'operator'
  };

  it('registers a new operator successfully with password hashed', async () => {
    const res = await request(app).post('/auth/register').send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.role).toBe('operator');
    // Critical: password hash must NEVER be leaked
    expect((res.body.user as any).passwordHash).toBeUndefined();
    expect((res.body.user as any).password).toBeUndefined();
  });

  it('rejects duplicate user registration with 409 Conflict', async () => {
    await request(app).post('/auth/register').send(testUser);
    const res = await request(app).post('/auth/register').send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('logs in registered operator and returns valid JWT token', async () => {
    await request(app).post('/auth/register').send(testUser);

    const res = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: testUser.password
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('rejects login with incorrect password', async () => {
    await request(app).post('/auth/register').send(testUser);

    const res = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: 'WrongPassword999!'
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('allows access to GET /auth/me with valid JWT token', async () => {
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: testUser.password
    });
    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(testUser.email);
  });

  it('rejects access to protected routes without JWT token', async () => {
    const res = await request(app).get('/api/microgrid/state');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
