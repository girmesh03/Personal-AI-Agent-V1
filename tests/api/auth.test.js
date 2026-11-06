/**
 * @file tests/api/auth.test.js
 * @description Postman-style native HTTP integration tests for Authentication and Session API.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Session } from '../../backend/src/modules/identity/domain/Session.js';

describe('Authentication & Session API Integration Tests', () => {
  let server;
  let baseUrl;
  const testEmail = `auth.test.${Date.now()}@example.com`;
  const testPassword = 'Password123!@';
  const autoEmail = `derivation.test.${Date.now()}@example.com`;
  let registeredUserId;
  let originalRefreshTokenCookie;
  let rotatedRefreshTokenCookie;

  before(async () => {
    await connectDB();

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Cleanup created users and sessions
    await User.deleteMany({ email: { $in: [testEmail, autoEmail] } });
    if (registeredUserId) {
      await Session.deleteMany({ userId: registeredUserId });
    }

    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnectDB();
  });

  it('POST /api/v1/auth/register successfully registers a user', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        firstName: 'Dawit',
        lastName: 'Alemu',
        position: 'Platform Lead',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'User registered successfully. Please log in.');
    assert.ok(body.data?.user?.id);
    assert.equal(body.data.user.email, testEmail);
    assert.equal(body.data.user.firstName, 'Dawit');
    assert.equal(body.data.user.lastName, 'Alemu');
    assert.equal(body.data.user.position, 'Platform Lead');
    assert.equal(body.data.user.password, undefined);

    registeredUserId = body.data.user.id;
  });

  it('POST /api/v1/auth/register auto-derives firstName and lastName when omitted', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: autoEmail,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.user.firstName.length >= 2);
    assert.ok(body.data.user.lastName.length >= 2);
  });

  it('POST /api/v1/auth/register rejects duplicate email with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'CONFLICT');
  });

  it('POST /api/v1/auth/register rejects weak password with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `invalid.pwd.${Date.now()}@example.com`,
        password: 'weak',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'VALIDATION_ERROR');
  });

  it('POST /api/v1/auth/register rejects role injection (single-user invariant)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `role.injection.${Date.now()}@example.com`,
        password: testPassword,
        role: 'admin',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.includes('Role assignment is strictly prohibited'));
  });

  it('POST /api/v1/auth/login succeeds with valid credentials and sets HttpOnly cookies', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Login successful');
    assert.equal(body.data.user.email, testEmail);

    // Verify Set-Cookie headers
    const setCookies = res.headers.getSetCookie();
    assert.ok(setCookies.length >= 2, 'Must set at least 2 cookies (access and refresh)');

    const hasAccessToken = setCookies.some((c) => c.startsWith('accessToken=') && c.includes('HttpOnly'));
    const hasRefreshToken = setCookies.some((c) => c.startsWith('refreshToken=') && c.includes('HttpOnly'));

    assert.ok(hasAccessToken, 'accessToken cookie must be set and HttpOnly');
    assert.ok(hasRefreshToken, 'refreshToken cookie must be set and HttpOnly');

    const refreshCookieRaw = setCookies.find((c) => c.startsWith('refreshToken='));
    originalRefreshTokenCookie = refreshCookieRaw.split(';')[0];
  });

  it('POST /api/v1/auth/login fails with invalid password returning 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword999!',
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh rotates tokens and issues fresh cookies', async () => {
    assert.ok(originalRefreshTokenCookie, 'Must have a refresh token from login');

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: originalRefreshTokenCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Token refreshed successfully');

    const setCookies = res.headers.getSetCookie();
    const newRefreshCookie = setCookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(newRefreshCookie, 'Must receive new rotated refreshToken cookie');

    rotatedRefreshTokenCookie = newRefreshCookie.split(';')[0];
    assert.notEqual(rotatedRefreshTokenCookie, originalRefreshTokenCookie, 'Rotated cookie must differ from original');
  });

  it('POST /api/v1/auth/refresh rejects revoked token and triggers breach detection', async () => {
    // Attempting to reuse originalRefreshTokenCookie which has already been revoked by the previous rotation
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: originalRefreshTokenCookie,
      },
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'TOKEN_REUSE_DETECTED');
  });

  it('POST /api/v1/auth/refresh rejects request without refresh token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'NO_REFRESH_TOKEN');
  });

  it('POST /api/v1/auth/logout clears auth cookies and revokes session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: rotatedRefreshTokenCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Logged out successfully');

    const setCookies = res.headers.getSetCookie();
    const accessCleared = setCookies.some((c) => c.startsWith('accessToken=;') || c.includes('Max-Age=0'));
    const refreshCleared = setCookies.some((c) => c.startsWith('refreshToken=;') || c.includes('Max-Age=0'));

    assert.ok(accessCleared, 'accessToken cookie must be cleared');
    assert.ok(refreshCleared, 'refreshToken cookie must be cleared');
  });

  it('GET /api/v1/auth/google/sso returns valid OAuth URL or unconfigured status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/google/sso?json=true`);
    assert.equal(res.status, 200);
    const body = await res.json();
    if (body.success) {
      assert.ok(body.url.includes('accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(body.url.includes('client_id='));
      assert.ok(body.url.includes('state='));
    } else {
      assert.equal(body.data?.configured, false);
    }
  });
});
