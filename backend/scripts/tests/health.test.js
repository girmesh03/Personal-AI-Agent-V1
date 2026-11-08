/**
 * @file backend/scripts/tests/health.test.js
 * @description Native Postman-style HTTP integration test suite for Operon health and readiness endpoints.
 */

import assert from 'assert';
import app from '../../src/app.js';
import { HTTP_STATUS } from '../../src/utils/constants.js';

const TEST_PORT = 4001;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

let server;

async function runHealthTests() {
  console.log('🧪 Starting Native HTTP Health Integration Test Suite (Port 4001)...\n');

  // Start HTTP server on isolated test port
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      resolve();
    });
  });

  let passedTests = 0;
  let failedTests = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}:`, err.message);
      failedTests++;
    }
  }

  try {
    // Test 1: GET /api/v1/health returns 200 and valid health payload
    await test('GET /api/v1/health returns 200 with structured health details', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      assert.strictEqual(response.status, HTTP_STATUS.OK, `Expected status 200, got ${response.status}`);

      const data = await response.json();
      assert.ok(data.status === 'healthy' || data.status === 'degraded', `Unexpected health status: ${data.status}`);
      assert.ok(typeof data.timestamp === 'string', 'Expected ISO timestamp string');
      assert.ok(typeof data.uptime === 'number', 'Expected numeric uptime');
      assert.ok(data.services?.database, 'Expected services.database object');
      assert.strictEqual(data.services.database.name, 'operon-v1', 'Expected database name operon-v1');
    });

    // Test 2: GET /api/v1/health/ready returns 200 or 503 with readiness status
    await test('GET /api/v1/health/ready returns appropriate readiness code', async () => {
      const response = await fetch(`${BASE_URL}/health/ready`);
      assert.ok(
        response.status === HTTP_STATUS.OK || response.status === HTTP_STATUS.SERVICE_UNAVAILABLE,
        `Unexpected readiness status code: ${response.status}`
      );

      const data = await response.json();
      assert.ok(data.status === 'ready' || data.status === 'unready', `Unexpected readiness status: ${data.status}`);
      assert.ok(data.services?.database, 'Expected services.database in readiness');
    });

    // Test 3: GET /api/v1/non-existent-route returns 404 NOT_FOUND
    await test('GET /api/v1/non-existent-route returns 404 with normalized error envelope', async () => {
      const response = await fetch(`${BASE_URL}/non-existent-route`);
      assert.strictEqual(response.status, HTTP_STATUS.NOT_FOUND, `Expected status 404, got ${response.status}`);

      const data = await response.json();
      assert.strictEqual(data.success, false, 'Expected success: false in error response');
      assert.strictEqual(data.error.code, 'NOT_FOUND', `Expected error code NOT_FOUND, got ${data.error.code}`);
      assert.ok(typeof data.error.correlationId === 'string', 'Expected correlationId in error envelope');
    });

    // Test 4: CORS Preflight and Origin handling for http://localhost:3000
    await test('CORS origin header validation for http://localhost:3000', async () => {
      const response = await fetch(`${BASE_URL}/health`, {
        headers: {
          Origin: 'http://localhost:3000',
        },
      });
      assert.strictEqual(response.status, HTTP_STATUS.OK, 'Expected status 200');
      assert.strictEqual(
        response.headers.get('access-control-allow-origin'),
        'http://localhost:3000',
        'Expected Access-Control-Allow-Origin header to match localhost:3000'
      );
      assert.strictEqual(
        response.headers.get('access-control-allow-credentials'),
        'true',
        'Expected Access-Control-Allow-Credentials to be true'
      );
    });

  } finally {
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  console.log(`\n📊 Health Test Suite Results: ${passedTests} passed, ${failedTests} failed.`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runHealthTests();
