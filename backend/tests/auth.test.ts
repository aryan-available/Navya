import request from 'supertest';
import { app } from '../src/index';
import './setup';

describe('Simple User Authentication System', () => {
  const testUser = {
    email: 'user@example.com',
    password: 'password123'
  };

  it('1. registers a new user successfully with password hashed', async () => {
    const res = await request(app).post('/auth/register').send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    // Crucial: password and passwordHash must NEVER be returned
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('2. rejects duplicate user registration with 409 Conflict', async () => {
    await request(app).post('/auth/register').send(testUser);
    const res = await request(app).post('/auth/register').send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('3. logs in registered user with correct password and returns JWT', async () => {
    await request(app).post('/auth/register').send(testUser);

    const res = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: testUser.password
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('4. rejects login with incorrect password with 401 Unauthorized', async () => {
    await request(app).post('/auth/register').send(testUser);

    const res = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: 'wrongpassword'
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('5. retrieves current user via GET /auth/me with valid JWT', async () => {
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app).post('/auth/login').send(testUser);
    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.id).toBeDefined();
    expect(meRes.body.user.email).toBe(testUser.email);
    expect(meRes.body.user.password).toBeUndefined();
    expect(meRes.body.user.passwordHash).toBeUndefined();
  });

  it('6. rejects GET /auth/me without JWT with 401 Unauthorized', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('7. rejects GET /auth/me with invalid JWT token with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.payload');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('8. verifies /signal remains public and unauthenticated', async () => {
    const res = await request(app).get('/signal');

    expect(res.status).toBe(200);
    expect(res.body.color).toBeDefined();
  });
});
