/**
 * @module tests/integration/phase1-foundation.test
 * @description Headless automated integration test suite for Phase 1 Foundation capabilities.
 * Validates canonical health check, operational ping, 404 error envelope, static upload denial,
 * malformed JSON defense, oversized payload protection, and Protocol 69 constants parity.
 * Strictly adheres to Protocol 68 (dual-modality test architecture) and Protocol 71 (JSDoc consistency).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestClient } from './testHarness.js';
import * as constants from '../../src/utils/constants.js';

describe('Phase 1 Foundation Automated Integration Test Suite', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {TestClient} */
  let client;
  /** @type {() => Promise<void>} */
  let stopServer;

  before(async () => {
    const testInstance = await startTestServer();
    server = testInstance.server;
    stopServer = testInstance.stop;
    client = new TestClient(testInstance.port);
  });

  after(async () => {
    if (stopServer) {
      await stopServer();
    }
  });

  it('1. Canonical Health Check endpoint returns HTTP 200 and operational status (Protocol 35)', async () => {
    const res = await client.request({ path: '/api/v1/health' });
    assert.equal(res.status, 200);
    assert.equal(res.data?.status, 'UP');
    assert.equal(typeof res.data?.uptime, 'number');
    assert.ok(res.data?.timestamp);
  });

  it('2. Operational Canary Ping endpoint returns HTTP 200 (Protocol 35)', async () => {
    const res = await client.request({ path: '/api/v1/ping' });
    assert.equal(res.status, 200);
    assert.equal(res.data?.success, true);
    assert.equal(res.data?.message, 'Operon API v1 operational');
    assert.ok(res.data?.timestamp);
  });

  it('3. Unmatched API route returns uniform HTTP 404 error envelope (Protocol 21, 35)', async () => {
    const res = await client.request({ path: '/api/v1/nonexistent-route-canary' });
    assert.equal(res.status, 404);
    assert.equal(res.data?.success, false);
    assert.equal(res.data?.errorCode, 'NOT_FOUND');
    assert.equal(res.data?.data, null);
  });

  it('4. Legacy /api/health un-versioned alias is permanently purged (Protocol 35, 44)', async () => {
    const res = await client.request({ path: '/api/health' });
    assert.equal(res.status, 404);
  });

  it('5. Static unauthenticated /uploads directory is strictly forbidden and purged (Protocol 43)', async () => {
    const res = await client.request({ path: '/uploads/avatar.png' });
    assert.equal(res.status, 404);
  });

  it('6. Malformed JSON syntax in request body is intercepted defensively at middleware boundary (Protocol 62)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      headers: { 'Content-Type': 'application/json' },
      body: '{\n  "email": "malformed@example.com",\n  "password": \n}',
    });
    assert.equal(res.status, 400);
    assert.equal(res.data?.errorCode, 'MALFORMED_JSON');
    assert.equal(res.data?.success, false);
  });

  it('7. Unexpected trailing characters after valid JSON payload are rejected (Protocol 62)', async () => {
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":"test@example.com","password":"Password123!"} > {% script %}',
    });
    assert.equal(res.status, 400);
    assert.equal(res.data?.errorCode, 'MALFORMED_JSON');
    assert.equal(res.data?.success, false);
  });

  it('8. Oversized payload exceeding 10MB limit triggers HTTP 413 PAYLOAD_TOO_LARGE defense', async () => {
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 97);
    const res = await client.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedBuffer,
    });
    assert.equal(res.status, 413);
    assert.equal(res.data?.errorCode, 'PAYLOAD_TOO_LARGE');
    assert.equal(res.data?.success, false);
  });

  it('9. Multi-Provider AI Architecture & Clean Namespacing Parity (Protocol 63, 69)', () => {
    const { AI_PROVIDERS, AI_MODELS, SUPPORTED_AI_MODELS, MODEL_PROVIDER_MAP, CHAT_CONSTANTS } = constants;

    assert.equal(AI_PROVIDERS.GOOGLE, 'google');
    assert.equal(AI_PROVIDERS.ADDIS, 'addis');

    // Protocol 69: Only provider keys exist at root of AI_MODELS
    const rootKeys = Object.keys(AI_MODELS).sort();
    assert.deepEqual(rootKeys, ['addis', 'google']);

    // Google provider models
    assert.equal(AI_MODELS.google.DEFAULT, 'gemini-3.1-flash-lite');
    assert.equal(AI_MODELS.google.PRO, 'gemini-3.8-flash');
    assert.equal(AI_MODELS.google.FALLBACK, 'gemini-3-flash-preview');
    assert.deepEqual(AI_MODELS.google.MODELS, [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3-flash-preview',
    ]);

    // Addis provider models
    assert.equal(AI_MODELS.addis.DEFAULT, 'addis-1');
    assert.deepEqual(AI_MODELS.addis.MODELS, ['addis-1']);

    // Global supported models array
    assert.deepEqual(SUPPORTED_AI_MODELS, [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3-flash-preview',
      'addis-1',
    ]);

    // Derived MODEL_PROVIDER_MAP
    assert.equal(MODEL_PROVIDER_MAP['gemini-3.1-flash-lite'], 'google');
    assert.equal(MODEL_PROVIDER_MAP['gemini-3.8-flash'], 'google');
    assert.equal(MODEL_PROVIDER_MAP['gemini-3-flash-preview'], 'google');
    assert.equal(MODEL_PROVIDER_MAP['addis-1'], 'addis');

    // CHAT_CONSTANTS references
    assert.equal(CHAT_CONSTANTS.DEFAULT_PROVIDER, 'google');
    assert.equal(CHAT_CONSTANTS.DEFAULT_MODEL, 'gemini-3.1-flash-lite');
    assert.deepEqual(CHAT_CONSTANTS.SUPPORTED_MODELS, SUPPORTED_AI_MODELS);
  });
});
