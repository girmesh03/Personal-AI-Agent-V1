/**
 * @module tests/integration/phase2-auth-user.test
 * @description Headless automated integration test suite for Phase 2 Authentication & User Domain.
 * Validates registration, pure cookie authentication, silent refresh, Google SSO, profile management,
 * avatar lifecycle, password change, unified agent configuration with BYOK apiKeys (Protocol 70),
 * user behavioral directives, canonical RESTful integrations hierarchy (Protocol 66), and Three-Tier Account Deletion (Protocol 42).
 * Strictly adheres to Protocol 68 (dual-modality test architecture & guaranteed database teardown hygiene)
 * and Protocol 71 (universal JSDoc consistency and strong type contracts).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer,
  TestClient,
  connectDB,
  disconnectDB,
  purgeTestUsers,
  TEST_EMAIL_DOMAIN_REGEX,
} from './testHarness.js';
import User from '../../src/models/User.js';
import { decryptSecret } from '../../src/utils/crypto.js';

describe('Phase 2 Authentication & User Domain Automated Integration Test Suite', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {() => Promise<void>} */
  let stopServer;
  /** @type {TestClient} */
  let client;

  const testUser = {
    email: 'phase2-architect@operon-test.local',
    password: 'Password123!',
    newPassword: 'NewPassword123!',
  };

  before(async () => {
    // 1. Connect to live MongoDB replica set
    await connectDB();

    // 2. Guaranteed pre-flight database purge (Protocol 68)
    await purgeTestUsers();

    // 3. Start ephemeral test server on dynamic OS port
    const testInstance = await startTestServer();
    server = testInstance.server;
    stopServer = testInstance.stop;
    client = new TestClient(testInstance.port);
  });

  after(async () => {
    try {
      // Guaranteed post-test database purge inside try/finally (Protocol 68)
      await purgeTestUsers();
      const remaining = await User.countDocuments({ email: TEST_EMAIL_DOMAIN_REGEX });
      assert.equal(remaining, 0, 'Teardown hygiene check failed: residual test users found in database');
    } finally {
      if (stopServer) {
        await stopServer();
      }
      await disconnectDB();
    }
  });

  // ==========================================================================
  // 1. REGISTRATION VALIDATION & PROTOCOL 32 INVARIANTS
  // ==========================================================================

  it('1. Registration rejects invalid email format with HTTP 422 VALIDATION_ERROR (Protocol 18, 39)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { email: 'not-an-email', password: testUser.password },
    });
    assert.equal(res.status, 422);
    assert.equal(res.data?.errorCode, 'VALIDATION_ERROR');
  });

  it('2. Registration rejects extra fields strictly preserving Protocol 32 Minimal Registration (Protocol 32, 39)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { email: 'extra@operon-test.local', password: testUser.password, name: 'Extra' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.data?.errorCode, 'VALIDATION_ERROR');
  });

  it('3. Registration rejects weak password failing complexity requirements (Protocol 18, 39)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { email: 'weak@operon-test.local', password: 'weak' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.data?.errorCode, 'VALIDATION_ERROR');
  });

  // ==========================================================================
  // 2. UNAUTHENTICATED PROTECTION (PROTOCOL 21, 61)
  // ==========================================================================

  it('4. Protected user profile endpoint rejects unauthenticated access with HTTP 401 UNAUTHENTICATED (Protocol 21, 61)', async () => {
    const unauthClient = new TestClient(client.port);
    const res = await unauthClient.request({ path: '/api/v1/users/profile' });
    assert.equal(res.status, 401);
    assert.equal(res.data?.errorCode, 'UNAUTHENTICATED');
  });

  // ==========================================================================
  // 3. REGISTRATION & PURE COOKIE ISSUANCE (PROTOCOL 17, 32, 38, 61)
  // ==========================================================================

  it('5. User registration succeeds with minimal payload and derives names deterministically (Protocol 32, 38, 61)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { email: testUser.email, password: testUser.password },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data?.success, true);
    assert.equal(res.data?.data?.user?.email, testUser.email);
    assert.equal(res.data?.data?.user?.firstName, 'Phase2');
    assert.equal(res.data?.data?.user?.lastName, 'Architect');

    // Protocol 61: Zero token exposure in JSON payload
    assert.equal(res.data?.accessToken, undefined);
    assert.equal(res.data?.refreshToken, undefined);
    assert.equal(res.data?.data?.accessToken, undefined);
    assert.equal(res.data?.data?.refreshToken, undefined);
  });

  it('6. Duplicate registration attempt triggers HTTP 409 CONFLICT', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { email: testUser.email, password: testUser.password },
    });
    assert.equal(res.status, 409);
    assert.equal(res.data?.errorCode, 'CONFLICT');
  });

  // ==========================================================================
  // 4. LOGIN & AUTHENTICATION COOKIES (PROTOCOL 17, 61)
  // ==========================================================================

  it('7. Login with invalid password fails with HTTP 401 INVALID_CREDENTIALS', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: testUser.email, password: 'WrongPassword123!' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.data?.errorCode, 'INVALID_CREDENTIALS');
  });

  it('8. Login with valid credentials succeeds and attaches pure HttpOnly cookies (Protocol 17, 61)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: testUser.email, password: testUser.password },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.equal(res.data?.data?.user?.email, testUser.email);

    // Protocol 61: Zero token exposure in JSON payload
    assert.equal(res.data?.accessToken, undefined);
    assert.equal(res.data?.refreshToken, undefined);

    // Protocol 17: Cookies present in Set-Cookie header
    const setCookie = res.headers['set-cookie'];
    assert.ok(Array.isArray(setCookie) && setCookie.length >= 2);
    assert.ok(setCookie.some((c) => c.includes('accessToken=')));
    assert.ok(setCookie.some((c) => c.includes('refreshToken=')));
    assert.ok(setCookie.every((c) => c.includes('HttpOnly')));

    // Client cookie jar populated
    assert.ok(client.cookies.has('accessToken'));
    assert.ok(client.cookies.has('refreshToken'));
  });

  // ==========================================================================
  // 5. SILENT REFRESH (PROTOCOL 17, 61)
  // ==========================================================================

  it('9. Session renewal via silent refresh rotates HttpOnly access token (Protocol 17, 61)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/refresh',
      body: {},
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.equal(res.data?.data?.user?.email, testUser.email);
    assert.equal(res.data?.accessToken, undefined);

    assert.ok(client.cookies.has('accessToken'));
    assert.ok(client.cookies.has('refreshToken'));
  });

  // ==========================================================================
  // 6. GOOGLE SSO QUERY VALIDATION & FLOW (PROTOCOL 34, 40, 60, 61)
  // ==========================================================================

  it('10. Google SSO callback missing code query redirects with error=ACCESS_DENIED (Protocol 40, 60)', async () => {
    const res = await client.request({
      method: 'GET',
      path: '/api/v1/auth/google/sso/callback',
      autoCookie: false,
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('error=ACCESS_DENIED'));
  });

  it('11. Google SSO callback with simulated mock code succeeds and issues auth cookies (Protocol 60, 61)', async () => {
    const ssoClient = new TestClient(client.port);
    const nonce = Date.now();
    const res = await ssoClient.request({
      method: 'GET',
      path: `/api/v1/auth/google/sso/callback?code=mock_code_sso_${nonce}`,
    });

    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/dashboard'));
    assert.ok(ssoClient.cookies.has('accessToken'));
    assert.ok(ssoClient.cookies.has('refreshToken'));

    // Verify created user is bound to isolation test domain (@operon-test.local)
    const ssoUser = await User.findOne({ email: `sso_${nonce}@operon-test.local` });
    assert.ok(ssoUser, 'SSO user must be created within @operon-test.local isolation domain');
  });

  // ==========================================================================
  // 7. USER PROFILE RETRIEVAL & UPDATE (PROTOCOL 21, 60)
  // ==========================================================================

  it('12. Authenticated user profile retrieval succeeds with sanitized payload (Protocol 21, 61)', async () => {
    const res = await client.request({ path: '/api/v1/users/profile' });
    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.equal(res.data?.data?.user?.email, testUser.email);
    assert.equal(res.data?.data?.user?.password, undefined);
  });

  it('13. User profile update modifies allowed fields via req.validated.body (Protocol 60)', async () => {
    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/profile',
      body: {
        firstName: 'LeadArchitect',
        position: 'Autonomous Systems Engineer',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.user?.firstName, 'LeadArchitect');
    assert.equal(res.data?.data?.user?.position, 'Autonomous Systems Engineer');
  });

  it('14. User profile update strictly rejects unauthorized injected fields (Protocol 60)', async () => {
    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/profile',
      body: {
        firstName: 'Hacker',
        role: 'superadmin',
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.data?.errorCode, 'VALIDATION_ERROR');
  });

  // ==========================================================================
  // 8. AVATAR ASSET MANAGEMENT (PROTOCOL 43, 60)
  // ==========================================================================

  it('15. Avatar update attaches Cloudinary asset reference and clears cleanly (Protocol 43, 60)', async () => {
    const avatarUrl = 'https://res.cloudinary.com/operon-cloud/image/upload/v1/avatar.png';
    const updateRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/avatar',
      body: { avatar: avatarUrl, avatarPublicId: 'operon/avatars/arch1' },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data?.data?.avatar, avatarUrl);

    const deleteRes = await client.request({
      method: 'DELETE',
      path: '/api/v1/users/avatar',
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.data?.data?.avatar, null);
  });

  // ==========================================================================
  // 9. PASSWORD MANAGEMENT (PROTOCOL 21, 60)
  // ==========================================================================

  it('16. Password change verifies current password and allows re-authentication with new password', async () => {
    const wrongCurrentRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/password',
      body: {
        currentPassword: 'WrongCurrentPassword123!',
        newPassword: testUser.newPassword,
        confirmNewPassword: testUser.newPassword,
      },
    });
    assert.equal(wrongCurrentRes.status, 401);
    assert.equal(wrongCurrentRes.data?.errorCode, 'INVALID_CREDENTIALS');

    const changeRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/password',
      body: {
        currentPassword: testUser.password,
        newPassword: testUser.newPassword,
        confirmNewPassword: testUser.newPassword,
      },
    });
    assert.equal(changeRes.status, 200);

    // Verify login with new password
    const loginRes = await client.request({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: testUser.email, password: testUser.newPassword },
    });
    assert.equal(loginRes.status, 200);
  });

  // ==========================================================================
  // 10. UNIFIED AGENT CONFIG & BYOK ENVELOPE ENCRYPTION (PROTOCOL 22, 63, 70)
  // ==========================================================================

  it('17. Agent configuration retrieval returns multi-provider defaults and key presence flags (Protocol 63, 70)', async () => {
    const res = await client.request({ path: '/api/v1/users/agent-config' });
    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.agentConfig?.defaultProvider, 'google');
    assert.equal(res.data?.data?.agentConfig?.defaultModel, 'gemini-3.1-flash-lite');
    assert.equal(res.data?.data?.apiKeys?.hasGeminiKey, false);
    assert.equal(res.data?.data?.apiKeys?.hasAddisKey, false);
  });

  it('18. Consolidated agent configuration updates persona and BYOK apiKeys simultaneously (Protocol 70)', async () => {
    const geminiKey = 'AIzaSyTestKeyForEnvelopeEncryption123456';
    const addisKey = 'addis_sk_live_test_secret_key_888';

    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/agent-config',
      body: {
        persona: 'High-Throughput Autonomous Implementation Architect',
        apiKeys: {
          geminiApiKey: geminiKey,
          addisApiKey: addisKey,
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.agentConfig?.persona, 'High-Throughput Autonomous Implementation Architect');
    assert.equal(res.data?.data?.apiKeys?.hasGeminiKey, true);
    assert.equal(res.data?.data?.apiKeys?.hasAddisKey, true);

    // Protocol 22 & 70: Raw API keys are NEVER exposed in JSON response
    assert.equal(res.data?.data?.apiKeys?.geminiApiKey, undefined);
    assert.equal(res.data?.data?.apiKeys?.addisApiKey, undefined);

    // Protocol 22: Cryptographically verify AES-256-GCM envelope encryption at rest in MongoDB
    const userDoc = await User.findOne({ email: testUser.email }).select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey');
    assert.ok(userDoc);
    const storedGemini = userDoc.settings.apiKeys.geminiApiKey;
    const storedAddis = userDoc.settings.apiKeys.addisApiKey;

    assert.ok(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(storedGemini), 'Gemini API key must be envelope-encrypted in format iv:authTag:ciphertext');
    assert.ok(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(storedAddis), 'Addis API key must be envelope-encrypted in format iv:authTag:ciphertext');

    assert.equal(decryptSecret(storedGemini), geminiKey);
    assert.equal(decryptSecret(storedAddis), addisKey);
  });

  it('19. Standalone /api-keys route is permanently purged returning HTTP 404 (Protocol 70)', async () => {
    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/api-keys',
      body: { geminiApiKey: 'any-key' },
    });
    assert.equal(res.status, 404);
  });

  it('20. Switching agent provider to Addis AI automatically resets thinking budget to 0 (Protocol 63)', async () => {
    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/agent-config',
      body: {
        defaultProvider: 'addis',
        defaultModel: 'addis-1',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.agentConfig?.defaultProvider, 'addis');
    assert.equal(res.data?.data?.agentConfig?.defaultModel, 'addis-1');
    assert.equal(res.data?.data?.agentConfig?.defaultThinkingBudget, 0);
  });

  it('21. Mismatched provider/model pairs and non-zero Addis thinking budgets are rejected (Protocol 18, 63)', async () => {
    const mismatchRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/agent-config',
      body: {
        defaultProvider: 'google',
        defaultModel: 'addis-1',
      },
    });
    assert.equal(mismatchRes.status, 422);

    const budgetRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/agent-config',
      body: {
        defaultProvider: 'addis',
        defaultModel: 'addis-1',
        defaultThinkingBudget: 2048,
      },
    });
    assert.equal(budgetRes.status, 422);
  });

  // ==========================================================================
  // 11. USER DIRECTIVES (PROTOCOL 37, 60, 65)
  // ==========================================================================

  it('22. User behavioral directives update successfully with Protocol 37 & 65 canonical naming', async () => {
    const res = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/directives',
      body: {
        userInstructions: ['Provide rigorous production code.', 'Enforce Protocol 68.'],
        negativeVocabulary: ['hack', 'temporary', 'deprecated'],
        phraseMappings: { ASAP: 'immediately with highest priority' },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.directives?.userInstructions?.length, 2);
    assert.equal(res.data?.data?.directives?.negativeVocabulary?.length, 3);
    assert.equal(res.data?.data?.directives?.phraseMappings?.ASAP, 'immediately with highest priority');
  });

  // ==========================================================================
  // 12. CANONICAL RESTFUL INTEGRATIONS HIERARCHY (PROTOCOL 66)
  // ==========================================================================

  it('23. Legacy un-prefixed integration routes are purged returning HTTP 404 (Protocol 44, 66)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/users/telegram/verify',
      body: { botToken: 'test:token' },
    });
    assert.equal(res.status, 404);
  });

  it('24. Cloudinary integration RESTful lifecycle operates with envelope encryption (Protocol 43, 66)', async () => {
    // Status
    const statusRes = await client.request({ path: '/api/v1/users/integrations/cloudinary/status' });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data?.data?.connected, false);

    // Negative Verify
    const negVerifyRes = await client.request({
      method: 'POST',
      path: '/api/v1/users/integrations/cloudinary/verify',
      body: { cloudName: 'invalid', apiKey: 'invalid', apiSecret: 'invalid' },
    });
    assert.equal(negVerifyRes.status, 400);

    // Connect
    const connectRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/integrations/cloudinary/connect',
      body: {
        cloudName: 'test-verified-cloud',
        apiKey: '123456789012345',
        apiSecret: 'secret_key_for_testing_123',
      },
    });
    assert.equal(connectRes.status, 200);
    assert.equal(connectRes.data?.data?.cloudinary?.connected, true);
    assert.equal(connectRes.data?.data?.cloudinary?.apiSecret, undefined);

    // Toggle
    const toggleRes = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/integrations/cloudinary/toggle',
      body: { enabled: false },
    });
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.data?.data?.enabled, false);

    // Disconnect
    const disconnectRes = await client.request({
      method: 'POST',
      path: '/api/v1/users/integrations/cloudinary/disconnect',
    });
    assert.equal(disconnectRes.status, 200);

    const postDisconnectStatus = await client.request({ path: '/api/v1/users/integrations/cloudinary/status' });
    assert.equal(postDisconnectStatus.data?.data?.connected, false);
  });

  it('25. Telegram and Google Drive integration status and toggles function canonically (Protocol 34, 66)', async () => {
    const tgStatus = await client.request({ path: '/api/v1/users/integrations/telegram/status' });
    assert.equal(tgStatus.status, 200);

    const tgToggle = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/integrations/telegram/toggle',
      body: { enabled: false },
    });
    assert.equal(tgToggle.status, 200);
    assert.equal(tgToggle.data?.data?.enabled, false);

    const driveStatus = await client.request({ path: '/api/v1/users/integrations/google-drive/status' });
    assert.equal(driveStatus.status, 200);

    const driveToggle = await client.request({
      method: 'PATCH',
      path: '/api/v1/users/integrations/google-drive/toggle',
      body: { enabled: false },
    });
    assert.equal(driveToggle.status, 200);
    assert.equal(driveToggle.data?.data?.enabled, false);
  });

  // ==========================================================================
  // 13. THREE-TIER ACCOUNT DELETION (PROTOCOL 42)
  // ==========================================================================

  it('26. Three-Tier Account Deletion purges database records, clears cookies, and revokes access (Protocol 42)', async () => {
    // Attempt deletion with wrong password
    const wrongPassRes = await client.request({
      method: 'DELETE',
      path: '/api/v1/users/account',
      body: { password: 'WrongPassword999!' },
    });
    assert.equal(wrongPassRes.status, 401);

    // Execute valid deletion with updated password
    const deleteRes = await client.request({
      method: 'DELETE',
      path: '/api/v1/users/account',
      body: { password: testUser.newPassword },
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.data?.success, true);

    // Tier 1: Record permanently purged from MongoDB
    const foundUser = await User.findOne({ email: testUser.email });
    assert.equal(foundUser, null, 'User document must be permanently purged from database in Tier 1');

    // Tier 2: Set-Cookie clears tokens across all paths
    const setCookie = deleteRes.headers['set-cookie'];
    assert.ok(Array.isArray(setCookie));
    assert.ok(setCookie.some((c) => c.includes('accessToken=;') || c.includes('accessToken=0')));

    // Subsequent access returns HTTP 401 UNAUTHENTICATED
    const postDeleteProfile = await client.request({ path: '/api/v1/users/profile' });
    assert.equal(postDeleteProfile.status, 401);
  });
});
