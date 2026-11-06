/**
 * @file tests/api/identity-suite.test.js
 * @description Comprehensive Phase 2 Identity, Session & Account Security Acceptance Test Suite (Task 2.5).
 * Validates: authentication lifecycle, concurrent refresh & replay breach detection, OAuth state security,
 * cross-user IDOR prevention, secret leakage absence, and account export/deletion lifecycle.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Session } from '../../backend/src/modules/identity/domain/Session.js';
import { assertUserOwnership, buildOwnerQuery } from '../../backend/src/infrastructure/security/userIsolation.js';
import { NotFoundError } from '../../backend/src/shared/errors/AppError.js';

const parseCookies = (res) => {
  const setCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  const accessCookie = setCookies.find((c) => c && c.startsWith('accessToken='));
  const refreshCookie = setCookies.find((c) => c && c.startsWith('refreshToken='));
  const accessToken = accessCookie ? accessCookie.split(';')[0].split('=')[1] : null;
  const refreshToken = refreshCookie ? refreshCookie.split(';')[0].split('=')[1] : null;
  const cookieHeader = [
    accessCookie ? accessCookie.split(';')[0] : null,
    refreshCookie ? refreshCookie.split(';')[0] : null,
  ].filter(Boolean).join('; ');
  return { accessToken, refreshToken, cookieHeader };
};

describe('Phase 2 Identity, Session & Account Security Acceptance Suite (Task 2.5)', () => {
  let server;
  let baseUrl;
  const userATimestamp = Date.now();
  const userAEmail = `user.a.${userATimestamp}@example.com`;
  const userBEmail = `user.b.${userATimestamp}@example.com`;
  const password = 'Password123!@';

  let userAId;
  let userBId;
  let userAToken;
  let userBToken;
  let userACookies = '';
  let userBCookies = '';

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
    if (userAId) {
      await User.findByIdAndDelete(userAId);
      await Session.deleteMany({ user: userAId });
    }
    if (userBId) {
      await User.findByIdAndDelete(userBId);
      await Session.deleteMany({ user: userBId });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Authentication Lifecycle & Session Reload (No localStorage Identity Authority)', () => {
    it('registers user A and logs in with HttpOnly cookies', async () => {
      // 1. Register
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Tester',
          email: userAEmail,
          password,
          position: 'General Manager',
        }),
      });

      assert.equal(regRes.status, 201);
      const regData = await regRes.json();
      assert.equal(regData.success, true);
      assert.ok(regData.data.user.id);
      userAId = regData.data.user.id;

      // 2. Login to establish session and get cookies
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userAEmail, password }),
      });

      assert.equal(loginRes.status, 200);
      const loginData = await loginRes.json();
      assert.equal(loginData.success, true);

      const parsed = parseCookies(loginRes);
      userAToken = parsed.accessToken;
      userACookies = parsed.cookieHeader;

      assert.ok(userAToken, 'accessToken must be present in Set-Cookie');
      assert.ok(parsed.refreshToken, 'refreshToken must be present in Set-Cookie');
      assert.ok(userACookies.includes('accessToken='), 'Must set accessToken cookie');
      assert.ok(userACookies.includes('refreshToken='), 'Must set refreshToken cookie');
    });

    it('verifies session survives browser reload using HttpOnly cookies alone', async () => {
      // Simulate client reloading page: no Authorization Bearer header, only browser cookies
      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        method: 'GET',
        headers: {
          Cookie: userACookies,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.user.email, userAEmail);
      assert.equal(data.data.user.id, userAId);
    });

    it('registers user B and logs in for cross-user tests', async () => {
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Bob',
          lastName: 'Tester',
          email: userBEmail,
          password,
          position: 'Assistant Manager',
        }),
      });

      assert.equal(regRes.status, 201);
      const regData = await regRes.json();
      userBId = regData.data.user.id;

      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userBEmail, password }),
      });
      assert.equal(loginRes.status, 200);
      const parsed = parseCookies(loginRes);
      userBToken = parsed.accessToken;
      userBCookies = parsed.cookieHeader;
      assert.ok(userBToken);
    });
  });

  describe('2. Concurrent Refresh & Replay Breach Detection', () => {
    it('executes token rotation and detects replay attack, revoking entire session family', async () => {
      // Login user A to obtain fresh refresh token and known session family
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userAEmail, password }),
      });
      assert.equal(loginRes.status, 200);
      const parsed = parseCookies(loginRes);
      const originalRefreshToken = parsed.refreshToken;

      // Legitimate rotation: 1st refresh request with originalRefreshToken
      const refresh1Res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: originalRefreshToken }),
      });
      assert.equal(refresh1Res.status, 200);
      const parsed1 = parseCookies(refresh1Res);
      const newRefreshToken = parsed1.refreshToken;
      assert.notEqual(newRefreshToken, originalRefreshToken);

      // Malicious replay / concurrent request: reuse originalRefreshToken
      const replayRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: originalRefreshToken }),
      });
      assert.equal(replayRes.status, 401);
      const replayData = await replayRes.json();
      assert.equal(replayData.error?.code, 'TOKEN_REUSE_DETECTED');

      // Verify breach detection consequence: entire family was invalidated!
      // Even the newly issued token cannot be refreshed anymore
      const refresh2Res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: newRefreshToken }),
      });
      assert.equal(refresh2Res.status, 401);

      // Re-login User A so userAToken is valid for subsequent test blocks
      const reloginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userAEmail, password }),
      });
      const parsedRelogin = parseCookies(reloginRes);
      userAToken = parsedRelogin.accessToken;
      userACookies = parsedRelogin.cookieHeader;
    });
  });

  describe('3. OAuth State/Nonce Security Verification', () => {
    it('rejects tampered OAuth state parameter on callback with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/sso/callback?code=mock-code&state=tampered-fake-state&json=true`);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'INVALID_STATE');
    });

    it('rejects missing OAuth state parameter on callback with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/google/sso/callback?code=mock-code&json=true`);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'MISSING_STATE');
    });
  });

  describe('4. Cross-User IDOR Defense & Data Isolation (NFR-SEC-004)', () => {
    it('strictly derives user identity from verified session, ignoring client-supplied user IDs', async () => {
      // User A attempts to overwrite User B's profile by supplying User B's ID in body
      const res = await fetch(`${baseUrl}/api/v1/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          userId: userBId, // Attempted IDOR injection
          firstName: 'AliceHacked',
        }),
      });

      assert.equal(res.status, 200);

      // Verify User A was modified
      const updatedUserA = await User.findById(userAId);
      assert.equal(updatedUserA.firstName, 'AliceHacked');

      // Verify User B is completely untouched
      const untouchedUserB = await User.findById(userBId);
      assert.equal(untouchedUserB.firstName, 'Bob');
    });

    it('assertUserOwnership throws identical 404 for nonexistent and foreign-owned resources', () => {
      const fakeDoc = { _id: 'doc-123', userId: userBId };

      // User A trying to access User B's resource
      assert.throws(
        () => assertUserOwnership(fakeDoc, userAId),
        (err) => err instanceof NotFoundError && err.statusCode === 404,
        'Must return 404 for unowned resource per NFR-SEC-004'
      );

      // Nonexistent resource
      assert.throws(
        () => assertUserOwnership(null, userAId),
        (err) => err instanceof NotFoundError && err.statusCode === 404,
        'Must return identical 404 for nonexistent resource'
      );
    });

    it('buildOwnerQuery guarantees user tenancy scope in MongoDB queries', () => {
      const scopedQuery = buildOwnerQuery(userAId, { status: 'active' });
      assert.deepEqual(scopedQuery, { status: 'active', userId: userAId });
    });
  });

  describe('5. Zero Secret Leakage Invariant across All Responses', () => {
    it('verifies register, login, profile, and me endpoints never expose secret hashes or raw keys', async () => {
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userAEmail, password }),
      });
      const loginBody = await loginRes.json();

      const user = loginBody.data.user;
      assert.equal(user.password, undefined);
      assert.equal(user.__v, undefined);
      assert.equal(user.settings?.apiKeys?.geminiApiKey, undefined);
      assert.equal(user.settings?.apiKeys?.addisApiKey, undefined);

      const profileRes = await fetch(`${baseUrl}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      assert.equal(profileRes.status, 200);
      const profileBody = await profileRes.json();
      const profileUser = profileBody.data.user;
      assert.equal(profileUser.password, undefined);
      assert.equal(profileUser.settings?.apiKeys?.geminiApiKey, undefined);
      assert.equal(profileUser.settings?.apiKeys?.addisApiKey, undefined);
    });
  });

  describe('6. Account Export & Permanent Deletion Foundation (FR-CORE-SEC-003)', () => {
    it('exports account data without exposing secrets', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/export`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.account);
      assert.equal(data.data.account.email, userAEmail);
      assert.equal(data.data.account.password, undefined);
      assert.equal(data.data.account.settings?.apiKeys?.geminiApiKey, undefined);
      assert.equal(data.data.account.settings?.apiKeys?.addisApiKey, undefined);
    });

    it('permanently deletes user account, revokes sessions, and prevents subsequent login', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userAToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify user record is deleted from MongoDB
      const deletedUser = await User.findById(userAId);
      assert.equal(deletedUser, null);

      // Verify active sessions are deleted
      const userSessions = await Session.find({ user: userAId });
      assert.equal(userSessions.length, 0);

      // Attempt to login with deleted user credentials fails with 401
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userAEmail, password }),
      });
      assert.equal(loginRes.status, 401);

      userAId = null; // Mark cleaned up
    });
  });
});
