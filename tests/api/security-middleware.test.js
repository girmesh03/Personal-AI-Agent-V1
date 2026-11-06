/**
 * @file tests/api/security-middleware.test.js
 * @description Postman-style native HTTP integration tests for requireUser, CSRF protection, and rate limiting.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';

describe('Security Middleware Integration Tests (requireUser, CSRF, Rate Limiting)', () => {
  let server;
  let baseUrl;
  const testEmail = `sec.middleware.${Date.now()}@example.com`;
  let testUser;
  let validAccessToken;

  before(async () => {
    await connectDB();

    testUser = await User.create({
      firstName: 'Security',
      lastName: 'Tester',
      email: testEmail,
      password: 'Password123!@',
      position: 'Security Auditor',
    });

    validAccessToken = generateAccessToken(testUser._id);

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
    if (testUser?._id) {
      await User.deleteOne({ _id: testUser._id });
    }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnectDB();
  });

  it('GET /api/v1/auth/me rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'UNAUTHENTICATED');
  });

  it('GET /api/v1/auth/me rejects invalid bearer token with 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid.tampered.token',
      },
    });
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'UNAUTHENTICATED');
  });

  it('GET /api/v1/auth/me succeeds with valid Bearer token in Authorization header', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${validAccessToken}`,
      },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data?.user?.email, testEmail);
    assert.equal(body.data?.user?.firstName, 'Security');
    assert.equal(body.data?.user?.lastName, 'Tester');
  });

  it('GET /api/v1/auth/me succeeds with valid accessToken in Cookie header', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Cookie: `accessToken=${validAccessToken}`,
      },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data?.user?.email, testEmail);
  });

  it('CSRF protection allows safe GET request without CSRF headers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Cookie: `accessToken=${validAccessToken}`,
      },
    });
    assert.equal(res.status, 200);
  });

  it('CSRF protection blocks cookie-authenticated state-changing request from untrusted origin', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `accessToken=${validAccessToken}`,
        Origin: 'https://evil-hacker-site.com',
      },
    });
    assert.equal(res.status, 403);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(['CSRF_ORIGIN_MISMATCH', 'CORS_ORIGIN_BLOCKED'].includes(body.errorCode));
  });

  it('CSRF protection blocks cookie-authenticated request when CSRF token is mismatched', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `accessToken=${validAccessToken}; csrfToken=valid-csrf-token-123`,
        Origin: 'http://localhost:3000',
        'X-CSRF-Token': 'wrong-csrf-token-999',
      },
    });
    assert.equal(res.status, 403);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'CSRF_TOKEN_MISMATCH');
  });

  it('CSRF protection allows cookie-authenticated request when CSRF token matches', async () => {
    const csrfToken = 'legitimate-matching-csrf-token-456';
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `accessToken=${validAccessToken}; csrfToken=${csrfToken}`,
        Origin: 'http://localhost:3000',
        'X-CSRF-Token': csrfToken,
      },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
  });

  it('Rate limiter exposes standard headers on API endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${validAccessToken}`,
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.has('ratelimit-limit') || res.headers.has('x-ratelimit-limit'));
  });
});
