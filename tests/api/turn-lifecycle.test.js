/**
 * @file tests/api/turn-lifecycle.test.js
 * @description Integration test suite for Turn Lifecycle Service & APIs (Task 4.3).
 * Exercises normal prompt send, idempotent replay, attachment validation & isolation,
 * generation retry (Section 10.2: no duplicate user turn), branch-isolated edit,
 * response continuation, run cancellation, and strict user isolation (NFR-SEC-004).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Thread } from '../../backend/src/modules/conversations/persistence/Thread.js';
import { MessageBranch } from '../../backend/src/modules/conversations/persistence/MessageBranch.js';
import { Turn } from '../../backend/src/modules/conversations/persistence/Turn.js';
import { Message } from '../../backend/src/modules/conversations/persistence/Message.js';
import { AgentRun } from '../../backend/src/modules/conversations/persistence/AgentRun.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';

describe('Task 4.3: Turn Lifecycle Service & APIs', () => {
  let server;
  let baseUrl;
  let userA;
  let tokenA;
  let userB;
  let tokenB;
  let threadA;
  let assetA;
  let assetB;
  const createdThreadIds = [];
  const createdUserIds = [];
  const createdAssetIds = [];

  before(async () => {
    await connectDB();

    userA = await User.create({
      firstName: 'Alice',
      lastName: 'Architect',
      email: `alice.turns.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userA._id);
    tokenA = generateAccessToken(userA._id);

    userB = await User.create({
      firstName: 'Bob',
      lastName: 'Builder',
      email: `bob.turns.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userB._id);
    tokenB = generateAccessToken(userB._id);

    // Create assets for attachment tests
    assetA = await Asset.create({
      owner: userA._id,
      originalName: 'operations-dossier.pdf',
      sanitizedName: 'operations-dossier.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1048576,
      storageKey: `assets/userA/dossier-${Date.now()}.pdf`,
      storagePath: 'assets/userA/dossier.pdf',
      sha256: 'a'.repeat(64),
      category: 'document',
    });
    createdAssetIds.push(assetA._id);

    assetB = await Asset.create({
      owner: userB._id,
      originalName: 'private-notes.pdf',
      sanitizedName: 'private-notes.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      storageKey: `assets/userB/notes-${Date.now()}.pdf`,
      storagePath: 'assets/userB/notes.pdf',
      sha256: 'b'.repeat(64),
      category: 'document',
    });
    createdAssetIds.push(assetB._id);

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Create Thread for User A via API
    const threadRes = await fetch(`${baseUrl}/api/v1/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        title: 'Turn Lifecycle Integration Test',
        config: { model: 'gemini-2.5-flash', provider: 'google' },
      }),
    });
    const threadData = await threadRes.json();
    threadA = threadData.data.thread;
    createdThreadIds.push(threadA._id);
  });

  after(async () => {
    if (createdThreadIds.length > 0) {
      await Thread.deleteMany({ _id: { $in: createdThreadIds } });
      await MessageBranch.deleteMany({ threadId: { $in: createdThreadIds } });
      await Turn.deleteMany({ threadId: { $in: createdThreadIds } });
      await Message.deleteMany({ threadId: { $in: createdThreadIds } });
      await AgentRun.deleteMany({ threadId: { $in: createdThreadIds } });
    }
    if (createdAssetIds.length > 0) {
      await Asset.deleteMany({ _id: { $in: createdAssetIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnectDB();
  });

  describe('1. Turn Submission (Normal Prompt Send)', () => {
    it('rejects unauthenticated prompt submission with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello agent' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHENTICATED');
    });

    it('rejects empty prompt with no attachments with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ content: '   ' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.code);
    });

    it('submits valid prompt: creates Turn, User Message, AgentRun, and acquires lease lock', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: 'Explain the operational architecture of Operon.',
          idempotencyKey: 'key-turn-1',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.ok(data.data.turn);
      assert.ok(data.data.userMessage);
      assert.ok(data.data.run);
      assert.equal(data.data.idempotentReplay, false);

      const turn = data.data.turn;
      assert.equal(turn.turnSequence, 1);
      assert.equal(turn.status, 'in_progress');
      assert.equal(turn.idempotencyKey, 'key-turn-1');
      assert.equal(turn.generationAttempts, 1);
      assert.ok(turn.runLock.holderRunId);

      const userMessage = data.data.userMessage;
      assert.equal(userMessage.role, 'user');
      assert.equal(userMessage.text, 'Explain the operational architecture of Operon.');
      assert.equal(userMessage.parts[0].type, 'text');
      assert.equal(userMessage.turnId, turn._id);

      const run = data.data.run;
      assert.equal(run.status, 'accepted');
      assert.equal(run.turnId, turn._id);

      // Verify thread counters were incremented
      const updatedThread = await Thread.findById(threadA._id);
      assert.equal(updatedThread.turnCount, 1);
      assert.equal(updatedThread.messageCount, 1);
    });
  });

  describe('2. Idempotent Turn Submission', () => {
    it('returns existing turn on duplicate idempotencyKey without creating duplicates', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: 'Explain the operational architecture of Operon.',
          idempotencyKey: 'key-turn-1',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.idempotentReplay, true);
      assert.ok(data.data.turn);
      assert.equal(data.data.turn.idempotencyKey, 'key-turn-1');

      // Verify database still only has 1 turn and 1 message
      const turnCount = await Turn.countDocuments({ threadId: threadA._id });
      assert.equal(turnCount, 1);

      const msgCount = await Message.countDocuments({ threadId: threadA._id });
      assert.equal(msgCount, 1);
    });
  });

  describe('3. Asset Attachments & Cross-Tenant Validation', () => {
    it('successfully binds authorized owned asset to turn message', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: 'Analyze the attached dossier.',
          attachments: [assetA._id.toString()],
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.turn.turnSequence, 2);

      const userMessage = data.data.userMessage;
      assert.equal(userMessage.attachments.length, 1);
      assert.equal(userMessage.attachments[0].originalName, 'operations-dossier.pdf');
      assert.equal(userMessage.attachments[0].mimeType, 'application/pdf');
    });

    it('rejects attaching another user asset with 404 NOT_FOUND (NFR-SEC-004)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: 'Steal foreign asset.',
          attachments: [assetB._id.toString()],
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error.code, 'NOT_FOUND');
    });
  });

  describe('4. Turn Retrieval & Listing APIs', () => {
    it('lists turns for thread in chronological turnSequence order', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.turns.length, 2);
      assert.equal(data.data.turns[0].turnSequence, 1);
      assert.equal(data.data.turns[1].turnSequence, 2);
    });

    it('retrieves single turn by ID with populated user message', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const firstTurn = turns[0];

      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${firstTurn._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.turn._id, firstTurn._id.toString());
      assert.ok(data.data.turn.userMessageId);
      assert.equal(data.data.turn.userMessageId.text, 'Explain the operational architecture of Operon.');
    });
  });

  describe('5. Retry Generation (Section 10.2: No Duplicate User Turn)', () => {
    it('rejects concurrent retry when turn is locked under an active lease with 409 Conflict', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const turn = turns[0];

      // Turn 1 is currently in_progress with active lease
      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${turn._id}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'CONFLICT');
    });

    it('retries generation after lease release: increments attempts and provisions new AgentRun without duplicating user turn', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const turn = turns[0];

      // Simulate prior generation completion / lock release
      await Turn.releaseRunLock(turn._id, turn.activeRunId);
      await Turn.updateOne({ _id: turn._id }, { $set: { status: 'completed' } });

      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${turn._id}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          modelSelection: { provider: 'google', modelId: 'gemini-3.1-pro' },
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');

      const updatedTurn = data.data.turn;
      assert.equal(updatedTurn.generationAttempts, 2);
      assert.equal(updatedTurn.status, 'in_progress');

      const newRun = data.data.run;
      assert.ok(newRun);
      assert.equal(newRun.model.modelId, 'gemini-3.1-pro');

      // Verify no duplicate user turn was created
      const totalTurns = await Turn.countDocuments({ threadId: threadA._id });
      assert.equal(totalTurns, 2);

      // Verify no duplicate user message was created
      const totalUserMsgs = await Message.countDocuments({ threadId: threadA._id, role: 'user' });
      assert.equal(totalUserMsgs, 2);
    });
  });

  describe('6. Branch-Isolated Edit (Section 10.2: Clean History Divergence)', () => {
    it('editing a turn forks a new branch without mutating original branch lineage', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const targetTurn = turns[0];

      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${targetTurn._id}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: 'Revised query: Explain the memory architecture instead.',
          branchName: 'memory-exploration',
          forkBranch: true,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.status, 'success');

      // Verify new branch was created
      const branch = data.data.branch;
      assert.ok(branch);
      assert.equal(branch.name, 'memory-exploration');
      assert.equal(branch.forkTurnId, targetTurn._id.toString());
      assert.equal(branch.forkMessageId, targetTurn.userMessageId.toString());

      // Verify new user message was created on the new branch
      const userMessage = data.data.userMessage;
      assert.equal(userMessage.text, 'Revised query: Explain the memory architecture instead.');
      assert.equal(userMessage.branchId, branch._id);

      // Verify new turn was created on the new branch at the same sequence index
      const newTurn = data.data.turn;
      assert.equal(newTurn.branchId, branch._id);
      assert.equal(newTurn.turnSequence, targetTurn.turnSequence);

      // Verify thread activeBranchId was switched
      const thread = await Thread.findById(threadA._id);
      assert.equal(thread.activeBranchId.toString(), branch._id.toString());

      // Verify original turn remains untouched
      const originalTurn = await Turn.findById(targetTurn._id);
      assert.notEqual(originalTurn.branchId.toString(), branch._id.toString());
    });
  });

  describe('7. Assistant Response Continuation', () => {
    it('continues response: provisions continuation run and acquires lock', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const turn = turns[0];

      // Release lock to simulate stopped generation
      await Turn.releaseRunLock(turn._id, turn.activeRunId);
      await Turn.updateOne({ _id: turn._id }, { $set: { status: 'completed' } });

      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${turn._id}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.turn.status, 'in_progress');
      assert.ok(data.data.run.metadata.isContinuation);
    });
  });

  describe('8. Turn & Run Cancellation Protocol (Section 11.3)', () => {
    it('cancels active turn: sets run and turn to cancelled and releases lock', async () => {
      const turns = await Turn.find({ threadId: threadA._id }).sort({ turnSequence: 1 });
      const turn = turns[0];

      const res = await fetch(`${baseUrl}/api/v1/threads/${threadA._id}/turns/${turn._id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ reason: 'user_stopped' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.cancelled, true);

      // Verify database state
      const dbTurn = await Turn.findById(turn._id);
      assert.equal(dbTurn.status, 'cancelled');
      assert.equal(dbTurn.runLock.holderRunId, null);

      const dbRun = await AgentRun.findById(turn.activeRunId);
      assert.equal(dbRun.status, 'cancelled');
      assert.equal(dbRun.cancellationReason, 'user_stopped');
    });
  });

  describe('9. Strict User Data Isolation (NFR-SEC-004)', () => {
    it('ensures User B receives uniform 404 NOT_FOUND across all turn endpoints for User A thread', async () => {
      const turnA = (await Turn.findOne({ threadId: threadA._id })) || { _id: new mongoose.Types.ObjectId() };

      const endpoints = [
        { method: 'POST', path: `/api/v1/threads/${threadA._id}/turns`, body: { content: 'Exploit' } },
        { method: 'GET', path: `/api/v1/threads/${threadA._id}/turns/${turnA._id}` },
        { method: 'POST', path: `/api/v1/threads/${threadA._id}/turns/${turnA._id}/retry` },
        { method: 'POST', path: `/api/v1/threads/${threadA._id}/turns/${turnA._id}/edit`, body: { content: 'Tamper' } },
        { method: 'POST', path: `/api/v1/threads/${threadA._id}/turns/${turnA._id}/continue` },
        { method: 'POST', path: `/api/v1/threads/${threadA._id}/turns/${turnA._id}/cancel` },
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(`${baseUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenB}`,
          },
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
        });

        assert.equal(
          res.status,
          404,
          `Expected 404 for User B probing ${endpoint.method} ${endpoint.path}, got ${res.status}`
        );
        const data = await res.json();
        assert.equal(data.error.code, 'NOT_FOUND');
      }
    });
  });
});
