/**
 * @file tests/api/run-events.test.js
 * @description Native HTTP integration test suite for RunEvent Durable Event Log & Stream Replay (Task 4.4).
 * Tests monotonic sequence generation, event envelope compliance (Section 11.1),
 * cursor-based JSON replay, SSE live streaming with Last-Event-ID reconnection,
 * deterministic stream closure, and strict user isolation (NFR-SEC-004).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Thread } from '../../backend/src/modules/conversations/persistence/Thread.js';
import { MessageBranch } from '../../backend/src/modules/conversations/persistence/MessageBranch.js';
import { Turn } from '../../backend/src/modules/conversations/persistence/Turn.js';
import { AgentRun } from '../../backend/src/modules/conversations/persistence/AgentRun.js';
import { RunEvent } from '../../backend/src/modules/conversations/persistence/RunEvent.js';
import { runEventService } from '../../backend/src/modules/conversations/services/runEventService.js';
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';

describe('Task 4.4: RunEvent Durable Event Log & Stream Replay', () => {
  let server;
  let baseUrl;
  let userA;
  let tokenA;
  let userB;
  let tokenB;
  let threadA;
  let branchA;
  let turnA;
  let runA;

  const createdThreadIds = [];
  const createdUserIds = [];

  before(async () => {
    await connectDB();

    // Create User A (owner)
    userA = await User.create({
      firstName: 'Alice',
      lastName: 'Architect',
      email: `alice.events.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userA._id);
    tokenA = generateAccessToken(userA._id);

    // Create User B (adversary)
    userB = await User.create({
      firstName: 'Bob',
      lastName: 'Builder',
      email: `bob.events.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userB._id);
    tokenB = generateAccessToken(userB._id);

    // Create initial thread, branch, turn, and run for User A
    threadA = await Thread.create({
      owner: userA._id,
      title: 'Stream Replay Test Thread',
    });
    createdThreadIds.push(threadA._id);

    branchA = await MessageBranch.create({
      threadId: threadA._id,
      owner: userA._id,
      name: 'main',
      isRoot: true,
      isActive: true,
    });
    threadA.activeBranchId = branchA._id;
    await threadA.save();

    turnA = await Turn.create({
      threadId: threadA._id,
      branchId: branchA._id,
      owner: userA._id,
      turnSequence: 1,
      status: 'in_progress',
    });

    runA = await AgentRun.create({
      threadId: threadA._id,
      turnId: turnA._id,
      branchId: branchA._id,
      owner: userA._id,
      model: { provider: 'google', modelId: 'gemini-2.5-flash' },
      status: 'started',
    });
    turnA.activeRunId = runA._id;
    await turnA.save();

    // Start ephemeral HTTP server on random port
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (createdThreadIds.length > 0) {
      await Thread.deleteMany({ _id: { $in: createdThreadIds } });
      await MessageBranch.deleteMany({ threadId: { $in: createdThreadIds } });
      await Turn.deleteMany({ threadId: { $in: createdThreadIds } });
      await AgentRun.deleteMany({ threadId: { $in: createdThreadIds } });
      await RunEvent.deleteMany({ threadId: { $in: createdThreadIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await disconnectDB();
  });

  // Helper for authorized JSON requests
  async function apiRequest(endpoint, { method = 'GET', body = null, token = tokenA } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    }
    return { res, status: res.status, data };
  }

  // Helper to read SSE chunks until a predicate is met or timeout
  async function readSSEStream(url, { token = tokenA, lastEventId = null, maxEvents = 10, timeoutMs = 5000 } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (lastEventId) headers['Last-Event-ID'] = String(lastEventId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      clearTimeout(timeout);
      let errorBody = null;
      try {
        errorBody = await res.json();
      } catch (_e) {}
      return { res, status: res.status, errorBody, events: [] };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events = [];

    try {
      while (events.length < maxEvents) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE messages separated by double newlines
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || ''; // Keep remainder in buffer

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(':')) continue; // Ignore heartbeat/comments
          const lines = block.split('\n');
          let id = null;
          let eventType = null;
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('id:')) {
              id = line.substring(3).trim();
            } else if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr += line.substring(5).trim();
            }
          }

          let parsedData = null;
          try {
            parsedData = JSON.parse(dataStr);
          } catch (_e) {
            parsedData = dataStr;
          }

          events.push({ id, event: eventType, data: parsedData });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        throw err;
      }
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }

    return { res, status: res.status, events };
  }

  // =========================================================================
  // 1. Authentication & Cross-Tenant Isolation (NFR-SEC-004)
  // =========================================================================
  describe('1. Authentication & Cross-Tenant Isolation (NFR-SEC-004)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`,
        { token: null }
      );
      assert.equal(status, 401);
      assert.equal(data.error.code, 'UNAUTHENTICATED');
    });

    it('ensures User B receives uniform 404 NOT_FOUND probing User A events', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`,
        { token: tokenB }
      );
      assert.equal(status, 404);
      assert.equal(data.error.code, 'NOT_FOUND');
    });

    it('ensures User B receives uniform 404 NOT_FOUND streaming User A run', async () => {
      const streamResult = await readSSEStream(
        `${baseUrl}/api/v1/threads/${threadA._id}/runs/${runA._id}/stream`,
        { token: tokenB }
      );
      assert.equal(streamResult.status, 404);
      assert.equal(streamResult.errorBody?.error?.code, 'NOT_FOUND');
    });
  });

  // =========================================================================
  // 2. Durable Event Persistence & Sequence Monotonicity
  // =========================================================================
  describe('2. Durable Event Persistence & Sequence Monotonicity', () => {
    it('records events with monotonically increasing sequence IDs', async () => {
      const e1 = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`,
        {
          method: 'POST',
          body: {
            type: 'message.started',
            data: { messageId: 'msg-001', role: 'assistant' },
          },
        }
      );
      assert.equal(e1.status, 201);
      assert.equal(e1.data.success, true);
      assert.equal(e1.data.data.version, 1);
      assert.equal(e1.data.data.sequence, 1);
      assert.equal(e1.data.data.eventId, `${runA._id}:1`);
      assert.equal(e1.data.data.type, 'message.started');
      assert.ok(e1.data.data.timestamp);

      const e2 = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`,
        {
          method: 'POST',
          body: {
            type: 'message.text.delta',
            data: { delta: 'Hello, ' },
          },
        }
      );
      assert.equal(e2.status, 201);
      assert.equal(e2.data.data.sequence, 2);
      assert.equal(e2.data.data.eventId, `${runA._id}:2`);

      const e3 = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`,
        {
          method: 'POST',
          body: {
            type: 'message.text.delta',
            data: { delta: 'world!' },
          },
        }
      );
      assert.equal(e3.status, 201);
      assert.equal(e3.data.data.sequence, 3);
      assert.equal(e3.data.data.eventId, `${runA._id}:3`);
    });

    it('enforces compound uniqueness on (runId, sequence) preventing collisions', async () => {
      await assert.rejects(
        async () => {
          await RunEvent.create({
            runId: runA._id,
            threadId: threadA._id,
            turnId: turnA._id,
            owner: userA._id,
            sequence: 1, // Duplicate of sequence 1
            eventId: `${runA._id}:1`,
            type: 'duplicate.collision.test',
          });
        },
        /duplicate key|E11000/
      );
    });
  });

  // =========================================================================
  // 3. JSON Event Replay & Cursor Traversal
  // =========================================================================
  describe('3. JSON Event Replay (GET /events)', () => {
    it('replays all historical events in ascending sequence order', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events`
      );
      assert.equal(status, 200);
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data.events));
      assert.ok(data.data.events.length >= 3);
      assert.equal(data.data.afterSequence, 0);
      assert.equal(data.data.lastSequence, 3);

      const sequences = data.data.events.map((e) => e.sequence);
      assert.deepEqual(sequences, [1, 2, 3]);
    });

    it('replays events after cursor (afterSequence) accurately', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events?afterSequence=2`
      );
      assert.equal(status, 200);
      assert.equal(data.data.events.length, 1);
      assert.equal(data.data.events[0].sequence, 3);
      assert.equal(data.data.events[0].type, 'message.text.delta');
      assert.equal(data.data.events[0].data.delta, 'world!');
      assert.equal(data.data.afterSequence, 2);
      assert.equal(data.data.lastSequence, 3);
      assert.equal(data.data.hasMore, false);
    });

    it('respects limit parameter and reports hasMore correctly', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runA._id}/events?limit=2`
      );
      assert.equal(status, 200);
      assert.equal(data.data.events.length, 2);
      assert.equal(data.data.events[0].sequence, 1);
      assert.equal(data.data.events[1].sequence, 2);
      assert.equal(data.data.hasMore, true);
      assert.equal(data.data.lastSequence, 2);
    });
  });

  // =========================================================================
  // 4. Server-Sent Events (SSE) Stream & Reconnection
  // =========================================================================
  describe('4. Server-Sent Events (SSE) Stream & Reconnection (GET /stream)', () => {
    it('replays historical events with proper text/event-stream headers', async () => {
      const streamUrl = `${baseUrl}/api/v1/threads/${threadA._id}/runs/${runA._id}/stream`;
      const result = await readSSEStream(streamUrl, { maxEvents: 3, timeoutMs: 3000 });

      assert.equal(result.status, 200);
      assert.ok(result.res.headers.get('content-type').includes('text/event-stream'));
      assert.ok(result.res.headers.get('cache-control').includes('no-cache'));

      assert.ok(result.events.length >= 3);
      assert.equal(result.events[0].id, `${runA._id}:1`);
      assert.equal(result.events[0].event, 'message.started');
      assert.equal(result.events[1].id, `${runA._id}:2`);
      assert.equal(result.events[2].id, `${runA._id}:3`);
    });

    it('reconnects with Last-Event-ID header and skips already received events', async () => {
      const streamUrl = `${baseUrl}/api/v1/threads/${threadA._id}/runs/${runA._id}/stream`;
      const result = await readSSEStream(streamUrl, {
        lastEventId: `${runA._id}:2`,
        maxEvents: 1,
        timeoutMs: 3000,
      });

      assert.equal(result.status, 200);
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].id, `${runA._id}:3`);
      assert.equal(result.events[0].data.sequence, 3);
      assert.equal(result.events[0].data.data.delta, 'world!');
    });

    it('streams newly emitted live events in real-time and closes on terminal event', async () => {
      // Create a fresh run for live streaming test
      const liveTurn = await Turn.create({
        threadId: threadA._id,
        branchId: branchA._id,
        owner: userA._id,
        turnSequence: 2,
        status: 'in_progress',
      });

      const liveRun = await AgentRun.create({
        threadId: threadA._id,
        turnId: liveTurn._id,
        branchId: branchA._id,
        owner: userA._id,
        model: { provider: 'google', modelId: 'gemini-2.5-flash' },
        status: 'started',
      });

      const streamUrl = `${baseUrl}/api/v1/threads/${threadA._id}/runs/${liveRun._id}/stream`;

      // Start stream consumer asynchronously
      const streamPromise = readSSEStream(streamUrl, { maxEvents: 2, timeoutMs: 5000 });

      // Wait a short tick for subscription setup, then emit live events via service
      await new Promise((r) => setTimeout(r, 200));

      await runEventService.recordEvent({
        runId: liveRun._id,
        threadId: threadA._id,
        turnId: liveTurn._id,
        owner: userA._id,
        type: 'message.text.delta',
        data: { delta: 'Live streaming chunk' },
      });

      await runEventService.recordEvent({
        runId: liveRun._id,
        threadId: threadA._id,
        turnId: liveTurn._id,
        owner: userA._id,
        type: 'run.completed',
        data: { totalTokens: 120 },
      });

      const result = await streamPromise;

      assert.equal(result.status, 200);
      assert.equal(result.events.length, 2);
      assert.equal(result.events[0].event, 'message.text.delta');
      assert.equal(result.events[0].data.data.delta, 'Live streaming chunk');
      assert.equal(result.events[1].event, 'run.completed');
      assert.equal(result.events[1].data.data.totalTokens, 120);
    });
  });

  // =========================================================================
  // 5. Turn Lifecycle Event Integration
  // =========================================================================
  describe('5. Turn Lifecycle Event Integration', () => {
    it('automatically records run.accepted upon turn creation', async () => {
      const { status, data } = await apiRequest(
        `/api/v1/threads/${threadA._id}/turns`,
        {
          method: 'POST',
          body: {
            content: 'Hello with automated run events!',
          },
        }
      );
      assert.equal(status, 201);
      const newRunId = data.data.run._id;

      // Query events for the new run
      const eventsRes = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${newRunId}/events`
      );
      assert.equal(eventsRes.status, 200);
      assert.ok(eventsRes.data.data.events.length >= 1);
      assert.equal(eventsRes.data.data.events[0].type, 'run.accepted');
      assert.equal(eventsRes.data.data.events[0].sequence, 1);
    });

    it('automatically records run.cancel_requested and run.cancelled upon turn cancellation', async () => {
      // Create a turn to cancel
      const turnCreate = await apiRequest(
        `/api/v1/threads/${threadA._id}/turns`,
        {
          method: 'POST',
          body: {
            content: 'Turn to be cancelled',
          },
        }
      );
      const turnId = turnCreate.data.data.turn._id;
      const runId = turnCreate.data.data.run._id;

      // Cancel turn
      const cancelRes = await apiRequest(
        `/api/v1/threads/${threadA._id}/turns/${turnId}/cancel`,
        {
          method: 'POST',
          body: {
            reason: 'User stopped generation midway',
          },
        }
      );
      assert.equal(cancelRes.status, 200);

      // Verify cancellation events logged on the run
      const eventsRes = await apiRequest(
        `/api/v1/threads/${threadA._id}/runs/${runId}/events`
      );
      assert.equal(eventsRes.status, 200);
      const eventTypes = eventsRes.data.data.events.map((e) => e.type);
      assert.ok(eventTypes.includes('run.accepted'));
      assert.ok(eventTypes.includes('run.cancel_requested'));
      assert.ok(eventTypes.includes('run.cancelled'));

      const cancelEvent = eventsRes.data.data.events.find((e) => e.type === 'run.cancelled');
      assert.equal(cancelEvent.data.reason, 'User stopped generation midway');
    });
  });
});
