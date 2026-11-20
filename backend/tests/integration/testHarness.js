/**
 * @module tests/integration/testHarness
 * @description Lightweight automated integration test harness executing against an ephemeral
 * Express 5 application instance with automated cookie management and database teardown hygiene.
 * Strictly adheres to Protocol 68 (dual-modality test architecture & teardown hygiene) and Protocol 71 (JSDoc consistency).
 */

import http from 'node:http';
import app from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/db.js';
import User from '../../src/models/User.js';
import Chat from '../../src/models/Chat.js';
import Message from '../../src/models/Message.js';
import Asset from '../../src/models/Asset.js';
import Branch from '../../src/models/Branch.js';
import Report from '../../src/models/Report.js';

/**
 * Domain regex strictly matching all test user accounts created during integration runs.
 * @constant
 * @type {RegExp}
 */
export const TEST_EMAIL_DOMAIN_REGEX = /@operon-test\.local$/i;

/**
 * Purges all test users belonging to the isolation test domain (*@operon-test.local)
 * and cascades deletion across all associated chats, messages, and assets.
 * Guaranteed teardown hygiene ensuring zero database leakage (Protocol 68).
 *
 * @function purgeTestUsers
 * @returns {Promise<import('mongoose').mongo.DeleteResult>} Mongoose delete operation result.
 */
export const purgeTestUsers = async () => {
  const testUsers = await User.find({ email: TEST_EMAIL_DOMAIN_REGEX }).select('_id');
  const userIds = testUsers.map((u) => u._id);
  if (userIds.length > 0) {
    await Promise.all([
      Chat.deleteMany({ user: { $in: userIds } }),
      Message.deleteMany({ user: { $in: userIds } }),
      Asset.deleteMany({ user: { $in: userIds } }),
      Branch.deleteMany({ user: { $in: userIds } }),
      Report.deleteMany({ user: { $in: userIds } }),
    ]);
  }
  return User.deleteMany({ email: TEST_EMAIL_DOMAIN_REGEX });
};

/**
 * Creates an ephemeral test server instance bound to an OS-assigned dynamic port (0).
 *
 * @function startTestServer
 * @returns {Promise<{ server: http.Server, port: number, baseUrl: string, stop: () => Promise<void> }>}
 */
export const startTestServer = () => {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const stop = () =>
        new Promise((resStop) => {
          server.close(() => resStop());
        });
      resolve({ server, port, baseUrl, stop });
    });
  });
};

/**
 * Session-aware HTTP test client maintaining an in-memory cookie jar.
 *
 * @class TestClient
 */
export class TestClient {
  /**
   * @param {number} port - Dynamic port of the active ephemeral test server.
   */
  constructor(port) {
    this.port = port;
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /**
   * Updates cookie jar from Set-Cookie response headers.
   *
   * @param {string[]|string|undefined} setCookieHeaders - Raw Set-Cookie header(s).
   */
  updateCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const headerArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const header of headerArray) {
      const [cookiePair] = header.split(';');
      const [name, ...valParts] = cookiePair.split('=');
      const value = valParts.join('=');
      if (value === '' || value === undefined) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  /**
   * Returns formatted Cookie request header from stored cookies.
   *
   * @returns {string} Formatted cookie header string.
   */
  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, val]) => `${name}=${val}`)
      .join('; ');
  }

  /**
   * Clears in-memory cookie jar.
   */
  clearCookies() {
    this.cookies.clear();
  }

  /**
   * Performs an HTTP request against the test server.
   *
   * @param {object} options - Request options.
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method='GET'] - HTTP method.
   * @param {string} options.path - Request URL path.
   * @param {Record<string, string>} [options.headers={}] - Custom request headers.
   * @param {string|Buffer|object} [options.body] - Request body (stringified automatically if object).
   * @param {boolean} [options.autoCookie=true] - Whether to send and persist session cookies.
   * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, data: any, raw: string }>}
   */
  request({ method = 'GET', path, headers = {}, body = null, autoCookie = true }) {
    return new Promise((resolve, reject) => {
      const reqHeaders = { ...headers };

      if (autoCookie && this.cookies.size > 0 && !reqHeaders.Cookie) {
        reqHeaders.Cookie = this.getCookieHeader();
      }

      let payload = body;
      if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
        payload = JSON.stringify(body);
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }

      if (payload !== null && !reqHeaders['Content-Length']) {
        reqHeaders['Content-Length'] = Buffer.isBuffer(payload)
          ? payload.length
          : Buffer.byteLength(payload);
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path,
          method,
          headers: reqHeaders,
        },
        (res) => {
          if (autoCookie && res.headers['set-cookie']) {
            this.updateCookies(res.headers['set-cookie']);
          }

          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });

          res.on('end', () => {
            let data;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }

            resolve({
              status: res.statusCode || 500,
              headers: res.headers,
              data,
              raw,
            });
          });
        }
      );

      req.on('error', reject);

      if (payload !== null) {
        req.write(payload);
      }
      req.end();
    });
  }
}

export { connectDB, disconnectDB, User, Chat, Message, Asset, Branch, Report };
