/**
 * @file tests/api/health.test.js
 * @description Postman-style native HTTP integration tests for server bootstrap and health endpoints.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';

describe('API Health and Bootstrap Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Bind to port 0 to allocate an ephemeral free port automatically
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
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('GET /api/v1/health returns 200 with valid health payload', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'UP');
    assert.ok(typeof body.uptime === 'number');
    assert.ok(typeof body.environment === 'string');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  });

  it('GET /health root alias returns 200 with valid health payload', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'UP');
  });

  it('GET /api/health alias returns 200 with valid health payload', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'UP');
  });

  it('GET /api/v1/non-existent returns 404 with structured error envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'NOT_FOUND');
    assert.ok(body.message.includes('non-existent-route'));
    assert.ok(body.error);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('Includes security headers from Helmet', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  });

  it('Allows permitted origins via CORS and sets credentials header', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });
});
