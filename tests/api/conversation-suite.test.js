/**
 * @file tests/api/conversation-suite.test.js
 * @description Comprehensive Phase 4 Acceptance Test Suite for Personal AI Agent V1 (Operon).
 * Validates complete end-to-end conversation journeys:
 * 1. Thread creation and automatic root branch provisioning
 * 2. Multi-turn prompt execution with structured message parts & owned asset binding
 * 3. Idempotent submission preventing duplicate turns during network retry
 * 4. Atomic single-generation lease locks & 409 Conflict rejection
 * 5. Deterministic cursor-based pagination over chronological message streams
 * 6. Clean conversation branching, switching, and branch-isolated edits (Section 10.2)
 * 7. Retry generation without duplicating logical user turn (Section 10.2)
 * 8. Assistant continuation extending stopped generations (Section 10.2)
 * 9. Cancellation protocol (Section 11.3) with lock release and terminal run event logging
 * 10. Resilient SSE streaming with Last-Event-ID reconnection and deterministic termination
 * 11. Strict tenant isolation (NFR-SEC-004) returning uniform 404 across all endpoints
 * 12. Soft-deletion and cascading cleanup across threads and messages
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
import { Message } from '../../backend/src/modules/conversations/persistence/Message.js';
import { AgentRun } from '../../backend/src/modules/conversations/persistence/AgentRun.js';
import { RunEvent } from '../../backend/src/modules/conversations/persistence/RunEvent.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import { runEventService } from '../../backend/src/modules/conversations/services/runEventService.js';
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';

describe('Phase 4 Acceptance Test Suite: Durable Conversations, Turns, Messages & Events', () => {
  let server;
  let baseUrl;
  let userA;
  let tokenA;
  let userB;
  let tokenB;
  let assetA;

  const createdUserIds = [];
  const createdThreadIds = [];
  const createdAssetIds = [];

  before(async () => {
    await connectDB();

    // 1. Seed User A (Owner)
    userA = await User.create({
      firstName: 'Alice',
      lastName: 'Acceptance',
      email: `alice.acceptance.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userA._id);
    tokenA = generateAccessToken(userA._id);

    // 2. Seed User B (Adversary)
    userB = await User.create({
      firstName: 'Bob',
      lastName: 'Builder',
      email: `bob.acceptance.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userB._id);
    tokenB = generateAccessToken(userB._id);

    // 3. Seed an authentic Asset owned by User A
    assetA = await Asset.create({
      owner: userA._id,
      originalName: 'system_architecture.pdf',
      sanitizedName: 'system_architecture.pdf',
      mimeType: 'application/pdf',
      category: 'document',
      sizeBytes: 1048576,
      storageKey: `documents/${userA._id}/system_architecture.pdf`,
      storagePath: `documents/${userA._id}/system_architecture.pdf`,
      sha256: 'a'.repeat(64),
      status: 'ready',
    });
    createdAssetIds.push(assetA._id);

    // 4. Start ephemeral HTTP server on dynamic port
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
      await Message.deleteMany({ threadId: { $in: createdThreadIds } });
      await AgentRun.deleteMany({ threadId: { $in: createdThreadIds } });
      await RunEvent.deleteMany({ threadId: { $in: createdThreadIds } });
    }
    if (createdAssetIds.length > 0) {
      await Asset.deleteMany({ _id: { $in: createdAssetIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await disconnectDB();
  });

  // Helper for authenticated HTTP JSON requests
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

  // Helper to read SSE chunks until event limit or timeout
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

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(':')) continue;
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
  // Scenario 1: Complete Conversational Lifecycle & Root Branch Provisioning
  // =========================================================================
  describe('Scenario 1: Thread Creation, Automatic Root Branch & Multi-Turn Execution', () => {
    let threadId;
    let turn1Id;
    let run1Id;

    it('creates a new thread and automatically provisions root "main" branch', async () => {
      const { status, data } = await apiRequest('/api/v1/threads', {
        method: 'POST',
        body: {
          title: 'Full Lifecycle Journey',
          config: { model: 'gemini-2.5-flash', provider: 'google', temperature: 0.7 },
        },
      });

      assert.equal(status, 201);
      assert.equal(data.status, 'success');
      assert.ok(data.data.thread._id);
      assert.equal(data.data.thread.title, 'Full Lifecycle Journey');
      assert.ok(data.data.thread.activeBranchId);

      threadId = data.data.thread._id;
      createdThreadIds.push(threadId);

      // Verify root branch in database
      const rootBranch = await MessageBranch.findOne({
        threadId,
        owner: userA._id,
        isRoot: true,
      });
      assert.ok(rootBranch);
      assert.equal(rootBranch.name, 'main');
      assert.equal(rootBranch.isActive, true);
      assert.equal(data.data.thread.activeBranchId.toString(), rootBranch._id.toString());
    });

    it('submits initial prompt: creates Turn 1, User Message 1, AgentRun 1, and acquires lease lock', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: {
          content: 'Hello Operon, please summarize our goals.',
          idempotencyKey: 'journey-turn-1',
        },
      });

      assert.equal(status, 201);
      assert.equal(data.status, 'success');
      assert.equal(data.data.turn.turnSequence, 1);
      assert.equal(data.data.turn.status, 'in_progress');
      assert.ok(data.data.userMessage);
      assert.equal(data.data.userMessage.sequence, 1);
      assert.equal(data.data.userMessage.parts[0].text, 'Hello Operon, please summarize our goals.');
      assert.ok(data.data.run);
      assert.equal(data.data.run.status, 'accepted');
      assert.equal(data.data.turn.runLock.holderRunId, data.data.run._id);

      turn1Id = data.data.turn._id;
      run1Id = data.data.run._id;

      // Verify thread counters incremented
      const threadRes = await apiRequest(`/api/v1/threads/${threadId}`);
      assert.equal(threadRes.data.data.thread.turnCount, 1);
      assert.equal(threadRes.data.data.thread.messageCount, 1);
    });

    it('replays identical prompt with same idempotencyKey without creating duplicates', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: {
          content: 'Hello Operon, please summarize our goals.',
          idempotencyKey: 'journey-turn-1',
        },
      });

      assert.equal(status, 200);
      assert.equal(data.data.idempotentReplay, true);
      assert.equal(data.data.turn._id, turn1Id);
      assert.equal(data.data.run._id, run1Id);

      // Verify no duplicate turns in database
      const count = await Turn.countDocuments({ threadId });
      assert.equal(count, 1);
    });

    it('binds an owned document asset to Turn 2 and creates structured multimodal parts', async () => {
      // Simulate Assistant message for Turn 1 to complete Turn 1
      await Message.create({
        threadId,
        branchId: (await Thread.findById(threadId)).activeBranchId,
        turnId: turn1Id,
        owner: userA._id,
        role: 'assistant',
        sequence: 2,
        parts: [{ type: 'text', text: 'Certainly! I am ready to assist with your goals.' }],
        status: 'completed',
      });
      await Turn.updateOne({ _id: turn1Id }, { status: 'completed' });
      await Turn.releaseRunLock(turn1Id, run1Id);

      // Submit Turn 2 with asset attachment
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: {
          content: 'Please inspect this system architecture diagram.',
          attachments: [assetA._id],
        },
      });

      assert.equal(status, 201);
      assert.equal(data.data.turn.turnSequence, 2);
      assert.equal(data.data.userMessage.attachments.length, 1);
      assert.equal(data.data.userMessage.attachments[0].assetId, String(assetA._id));
      assert.equal(data.data.userMessage.attachments[0].filename, 'system_architecture.pdf');
    });
  });

  // =========================================================================
  // Scenario 2: Conversation Branching, History Preservation & Isolated Edit
  // =========================================================================
  describe('Scenario 2: Branching, History Preservation & Branch-Isolated Edit', () => {
    let threadId;
    let turn1Id;
    let branch1Id;
    let branch2Id;

    before(async () => {
      const threadRes = await apiRequest('/api/v1/threads', {
        method: 'POST',
        body: { title: 'Branching Test Thread' },
      });
      threadId = threadRes.data.data.thread._id;
      createdThreadIds.push(threadId);

      const rootBranch = await MessageBranch.findOne({ threadId, isRoot: true });
      branch1Id = rootBranch._id.toString();

      const turnRes = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: { content: 'Original prompt on main branch' },
      });
      turn1Id = turnRes.data.data.turn._id;

      // Complete turn 1
      await Message.create({
        threadId,
        branchId: branch1Id,
        turnId: turn1Id,
        owner: userA._id,
        role: 'assistant',
        sequence: 2,
        parts: [{ type: 'text', text: 'Original response on main branch' }],
        status: 'completed',
      });
      await Turn.updateOne({ _id: turn1Id }, { status: 'completed' });
      await Turn.releaseRunLock(turn1Id, turnRes.data.data.run._id);
    });

    it('forks a new branch via branch-isolated edit without mutating original branch', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns/${turn1Id}/edit`, {
        method: 'POST',
        body: {
          content: 'Edited divergent prompt on alternative branch',
          forkBranch: true,
          branchName: 'experiment-branch',
        },
      });

      assert.equal(status, 201);
      assert.equal(data.status, 'success');
      assert.ok(data.data.branch);
      assert.equal(data.data.branch.name, 'experiment-branch');
      assert.equal(String(data.data.branch.parentBranchId), String(branch1Id));
      branch2Id = data.data.branch._id;

      // Active branch switched to new branch
      const threadRes = await apiRequest(`/api/v1/threads/${threadId}`);
      const activeBranchId = threadRes.data.data.thread.activeBranchId?._id || threadRes.data.data.thread.activeBranchId;
      assert.equal(String(activeBranchId), String(branch2Id));

      // Verify parent branch turns remain unchanged
      const originalTurn = await Turn.findById(turn1Id);
      assert.equal(originalTurn.branchId.toString(), branch1Id);
      const originalMessage = await Message.findById(originalTurn.userMessageId);
      assert.equal(originalMessage.parts[0].text, 'Original prompt on main branch');
    });

    it('allows switching active branch back and forth cleanly', async () => {
      // Switch back to main
      const switchBack = await apiRequest(
        `/api/v1/threads/${threadId}/branches/${branch1Id}/switch`,
        { method: 'POST' }
      );
      assert.equal(switchBack.status, 200);
      assert.equal(String(switchBack.data.data.activeBranchId), String(branch1Id));

      // Switch to experimental
      const switchToExp = await apiRequest(
        `/api/v1/threads/${threadId}/branches/${branch2Id}/switch`,
        { method: 'POST' }
      );
      assert.equal(switchToExp.status, 200);
      assert.equal(String(switchToExp.data.data.activeBranchId), String(branch2Id));
    });
  });

  // =========================================================================
  // Scenario 3: Cursor Pagination, Replay & Generation Lifecycle (Retry, Continue, Cancel)
  // =========================================================================
  describe('Scenario 3: Pagination, Retry, Continuation & Cancellation Protocol', () => {
    let threadId;
    let turnId;
    let runId;

    before(async () => {
      const threadRes = await apiRequest('/api/v1/threads', {
        method: 'POST',
        body: { title: 'Lifecycle Protocols Thread' },
      });
      threadId = threadRes.data.data.thread._id;
      createdThreadIds.push(threadId);

      const turnRes = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: { content: 'Please draft a proposal.' },
      });
      turnId = turnRes.data.data.turn._id;
      runId = turnRes.data.data.run._id;
    });

    it('rejects concurrent retry when turn is locked under an active lease with 409 Conflict', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns/${turnId}/retry`, {
        method: 'POST',
      });
      assert.equal(status, 409);
      assert.equal(data.error.code, 'CONFLICT');
    });

    it('retries generation after lease release: increments attempts and preserves user turn (Section 10.2)', async () => {
      await Turn.releaseRunLock(turnId, runId);

      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns/${turnId}/retry`, {
        method: 'POST',
      });
      assert.equal(status, 200);
      assert.equal(data.data.turn.generationAttempts, 2);
      assert.notEqual(data.data.run._id, runId); // New run created

      // Verify no duplicate turns
      const turns = await Turn.find({ threadId });
      assert.equal(turns.length, 1);

      // Release lock for continuation test
      await Turn.releaseRunLock(turnId, data.data.run._id);
    });

    it('continues response: provisions continuation run and acquires lock (Section 10.2)', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns/${turnId}/continue`, {
        method: 'POST',
      });
      assert.equal(status, 200);
      assert.equal(data.data.run.metadata.isContinuation, true);
      assert.equal(data.data.turn.runLock.holderRunId, data.data.run._id);
    });

    it('cancels active turn: sets run/turn to cancelled, releases lock, and logs events (Section 11.3)', async () => {
      const { status, data } = await apiRequest(`/api/v1/threads/${threadId}/turns/${turnId}/cancel`, {
        method: 'POST',
        body: { reason: 'User hit stop button' },
      });

      assert.equal(status, 200);
      assert.equal(data.data.cancelled, true);
      assert.equal(data.data.turn.status, 'cancelled');
      assert.equal(data.data.turn.runLock.holderRunId, null);

      // Verify RunEvent log contains run.cancelled
      const activeRunId = data.data.run._id;
      const eventsRes = await apiRequest(`/api/v1/threads/${threadId}/runs/${activeRunId}/events`);
      assert.equal(eventsRes.status, 200);
      const eventTypes = eventsRes.data.data.events.map((e) => e.type);
      assert.ok(eventTypes.includes('run.cancel_requested'));
      assert.ok(eventTypes.includes('run.cancelled'));
    });

    it('paginates backwards (history scrolling) using cursor tuples and returns chronological slice', async () => {
      // Seed a second message in thread so multiple messages exist for pagination
      await Message.create({
        threadId,
        branchId: (await Thread.findById(threadId)).activeBranchId,
        turnId,
        owner: userA._id,
        role: 'assistant',
        sequence: 2,
        parts: [{ type: 'text', text: 'Second response message in thread.' }],
        status: 'completed',
      });

      // Query messages page 1
      const page1 = await apiRequest(`/api/v1/threads/${threadId}/messages?limit=1`);
      assert.equal(page1.status, 200);
      assert.equal(page1.data.data.messages.length, 1);
      assert.ok(page1.data.data.pagination.hasMore);
      assert.ok(page1.data.data.pagination.nextCursor);

      // Query page 2 with nextCursor
      const page2 = await apiRequest(
        `/api/v1/threads/${threadId}/messages?limit=1&cursor=${encodeURIComponent(page1.data.data.pagination.nextCursor)}`
      );
      assert.equal(page2.status, 200);
      assert.notEqual(page2.data.data.messages[0]._id, page1.data.data.messages[0]._id);
    });
  });

  // =========================================================================
  // Scenario 4: Durable Event Stream & Reconnection (Last-Event-ID)
  // =========================================================================
  describe('Scenario 4: Durable RunEvent Stream Replay & Last-Event-ID Reconnection', () => {
    let threadId;
    let turnId;
    let runId;

    before(async () => {
      const threadRes = await apiRequest('/api/v1/threads', {
        method: 'POST',
        body: { title: 'SSE Reconnection Acceptance Thread' },
      });
      threadId = threadRes.data.data.thread._id;
      createdThreadIds.push(threadId);

      const turnRes = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: { content: 'Trigger streaming' },
      });
      turnId = turnRes.data.data.turn._id;
      runId = turnRes.data.data.run._id;

      // Seed 3 events on this run
      await runEventService.recordEvent({
        runId,
        threadId,
        turnId,
        owner: userA._id,
        type: 'message.text.delta',
        data: { delta: 'Part 1: ' },
      });
      await runEventService.recordEvent({
        runId,
        threadId,
        turnId,
        owner: userA._id,
        type: 'message.text.delta',
        data: { delta: 'Part 2: ' },
      });
    });

    it('replays historical events over SSE with standard wire format', async () => {
      const streamUrl = `${baseUrl}/api/v1/threads/${threadId}/runs/${runId}/stream`;
      const result = await readSSEStream(streamUrl, { maxEvents: 3, timeoutMs: 3000 });

      assert.equal(result.status, 200);
      assert.ok(result.res.headers.get('content-type').includes('text/event-stream'));
      assert.ok(result.events.length >= 3);
      assert.equal(result.events[0].event, 'run.accepted');
      assert.equal(result.events[1].event, 'message.text.delta');
      assert.equal(result.events[1].data.data.delta, 'Part 1: ');
      assert.equal(result.events[2].data.data.delta, 'Part 2: ');
    });

    it('resumes streaming from Last-Event-ID and skips already received events', async () => {
      const streamUrl = `${baseUrl}/api/v1/threads/${threadId}/runs/${runId}/stream`;
      const result = await readSSEStream(streamUrl, {
        lastEventId: `${runId}:2`,
        maxEvents: 1,
        timeoutMs: 3000,
      });

      assert.equal(result.status, 200);
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].id, `${runId}:3`);
      assert.equal(result.events[0].data.data.delta, 'Part 2: ');
    });
  });

  // =========================================================================
  // Scenario 5: Strict Cross-Tenant Isolation (NFR-SEC-004) & Soft Deletion
  // =========================================================================
  describe('Scenario 5: Strict User Isolation (NFR-SEC-004) & Soft Deletion', () => {
    let threadId;
    let turnId;
    let runId;

    before(async () => {
      const threadRes = await apiRequest('/api/v1/threads', {
        method: 'POST',
        body: { title: 'Security Isolation Thread' },
      });
      threadId = threadRes.data.data.thread._id;
      createdThreadIds.push(threadId);

      const turnRes = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: { content: 'Confidential user data' },
      });
      turnId = turnRes.data.data.turn._id;
      runId = turnRes.data.data.run._id;
    });

    it('ensures User B receives uniform 404 NOT_FOUND across all endpoints probing User A thread', async () => {
      // 1. Thread inspection
      const getThread = await apiRequest(`/api/v1/threads/${threadId}`, { token: tokenB });
      assert.equal(getThread.status, 404);
      assert.equal(getThread.data.error.code, 'NOT_FOUND');

      // 2. Message list
      const getMessages = await apiRequest(`/api/v1/threads/${threadId}/messages`, { token: tokenB });
      assert.equal(getMessages.status, 404);

      // 3. Turn submission
      const postTurn = await apiRequest(`/api/v1/threads/${threadId}/turns`, {
        method: 'POST',
        body: { content: 'Adversary injection' },
        token: tokenB,
      });
      assert.equal(postTurn.status, 404);

      // 4. Turn inspection
      const getTurn = await apiRequest(`/api/v1/threads/${threadId}/turns/${turnId}`, { token: tokenB });
      assert.equal(getTurn.status, 404);

      // 5. Run events inspection
      const getEvents = await apiRequest(`/api/v1/threads/${threadId}/runs/${runId}/events`, { token: tokenB });
      assert.equal(getEvents.status, 404);

      // 6. Run SSE stream
      const streamRes = await readSSEStream(`${baseUrl}/api/v1/threads/${threadId}/runs/${runId}/stream`, {
        token: tokenB,
      });
      assert.equal(streamRes.status, 404);
    });

    it('soft-deletes thread and cascades soft-delete to associated messages', async () => {
      const delRes = await apiRequest(`/api/v1/threads/${threadId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      // Direct DB inspection confirms soft-deletion
      const threadInDb = await Thread.findById(threadId);
      assert.equal(threadInDb.isDeleted, true);

      const messagesInDb = await Message.find({ threadId });
      assert.ok(messagesInDb.length > 0);
      assert.ok(messagesInDb.every((m) => m.isDeleted === true));

      // Attempting to fetch deleted thread via API returns 404
      const getDeleted = await apiRequest(`/api/v1/threads/${threadId}`);
      assert.equal(getDeleted.status, 404);
    });
  });
});
