/**
 * @file tests/api/conversation-models.test.js
 * @description Integration test suite for Deconstructed Conversation Persistence Models (Task 4.1 - Phase 4).
 * Validates Thread, MessageBranch, Turn, Message, AgentRun, and RunEvent models,
 * non-monolithic data storage, atomic run lock/lease, idempotency constraints, cursor pagination tuples,
 * and backward compatibility bridges.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Thread } from '../../backend/src/modules/conversations/persistence/Thread.js';
import { MessageBranch } from '../../backend/src/modules/conversations/persistence/MessageBranch.js';
import { Turn } from '../../backend/src/modules/conversations/persistence/Turn.js';
import { Message } from '../../backend/src/modules/conversations/persistence/Message.js';
import { AgentRun } from '../../backend/src/modules/conversations/persistence/AgentRun.js';
import { RunEvent } from '../../backend/src/modules/conversations/persistence/RunEvent.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import { Chat } from '../../backend/src/models/Chat.js';

describe('Task 4.1: Durable Conversation Models & Persistence Architecture', () => {
  let testUser;
  let foreignUser;
  const createdThreadIds = [];
  const createdUserIds = [];

  before(async () => {
    await connectDB();

    testUser = await User.create({
      firstName: 'Convo',
      lastName: 'Tester',
      email: `convo.tester.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(testUser._id);

    foreignUser = await User.create({
      firstName: 'Foreign',
      lastName: 'User',
      email: `foreign.user.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(foreignUser._id);
  });

  after(async () => {
    if (createdThreadIds.length > 0) {
      await Thread.deleteMany({ _id: { $in: createdThreadIds } });
      await MessageBranch.deleteMany({ threadId: { $in: createdThreadIds } });
      await Turn.deleteMany({ threadId: { $in: createdThreadIds } });
      await Message.deleteMany({ threadId: { $in: createdThreadIds } });
      await AgentRun.deleteMany({ threadId: { $in: createdThreadIds } });
      await RunEvent.deleteMany({ threadId: { $in: createdThreadIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await disconnectDB();
  });

  describe('1. Thread Model & Lifecycle Operations', () => {
    it('creates an active thread with default configuration and timestamps', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Project Inception Discussion',
        config: {
          model: 'gemini-2.5-flash',
          provider: 'google',
          thinkingBudget: 4096,
          language: 'am',
        },
      });
      createdThreadIds.push(thread._id);

      assert.ok(thread._id);
      assert.equal(thread.title, 'Project Inception Discussion');
      assert.equal(thread.status, 'active');
      assert.equal(thread.isPinned, false);
      assert.equal(thread.isArchived, false);
      assert.equal(thread.isDeleted, false);
      assert.equal(thread.turnCount, 0);
      assert.equal(thread.messageCount, 0);
      assert.equal(thread.config.model, 'gemini-2.5-flash');
      assert.equal(thread.config.language, 'am');
      assert.ok(thread.createdAt instanceof Date);
      assert.ok(thread.lastMessageAt instanceof Date);

      // Verify V0 backward compatibility virtual getter/setter for Chat.user
      assert.equal(thread.user.toString(), testUser._id.toString());
      thread.user = foreignUser._id;
      assert.equal(thread.owner.toString(), foreignUser._id.toString());
      thread.user = testUser._id; // revert
    });

    it('archives and restores thread via atomic lifecycle static methods', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Thread to Archive',
      });
      createdThreadIds.push(thread._id);

      // Archive thread
      const archived = await Thread.archiveThread(thread._id, testUser._id);
      assert.equal(archived.status, 'archived');
      assert.equal(archived.isArchived, true);
      assert.ok(archived.archivedAt instanceof Date);

      // Cannot archive if foreign user attempts it
      const unauthorizedArchive = await Thread.archiveThread(thread._id, foreignUser._id);
      assert.equal(unauthorizedArchive, null);

      // Restore thread
      const restored = await Thread.restoreThread(thread._id, testUser._id);
      assert.equal(restored.status, 'active');
      assert.equal(restored.isArchived, false);
      assert.equal(restored.archivedAt, null);

      // Soft delete thread
      const deleted = await Thread.softDelete(thread._id, testUser._id);
      assert.equal(deleted.isDeleted, true);
      assert.ok(deleted.deletedAt instanceof Date);
    });

    it('backward compatibility bridge (backend/src/models/Chat.js) persists as Thread', async () => {
      const chat = await Chat.create({
        owner: testUser._id,
        title: 'Bridge Compatibility Test Chat',
      });
      createdThreadIds.push(chat._id);

      assert.ok(chat._id);
      const queriedThread = await Thread.findById(chat._id);
      assert.ok(queriedThread);
      assert.equal(queriedThread.title, 'Bridge Compatibility Test Chat');
      assert.equal(queriedThread.owner.toString(), testUser._id.toString());
    });
  });

  describe('2. MessageBranch Model & Forking Support', () => {
    it('creates root branch and child forked branch without mutating history', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Branching Test Thread',
      });
      createdThreadIds.push(thread._id);

      // Create root branch
      const rootBranch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
        isRoot: true,
        isActive: true,
      });

      // Update thread activeBranchId
      thread.activeBranchId = rootBranch._id;
      await thread.save();

      // Create dummy turn for fork point
      const forkTurnId = new mongoose.Types.ObjectId();
      const forkMessageId = new mongoose.Types.ObjectId();

      // Create divergent branch from fork point
      const forkedBranch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'branch-edit-turn-2',
        parentBranchId: rootBranch._id,
        forkTurnId,
        forkMessageId,
        isRoot: false,
        isActive: true,
      });

      assert.ok(forkedBranch._id);
      assert.equal(forkedBranch.parentBranchId.toString(), rootBranch._id.toString());
      assert.equal(forkedBranch.forkTurnId.toString(), forkTurnId.toString());
      assert.equal(forkedBranch.isRoot, false);

      const threadBranches = await MessageBranch.find({ threadId: thread._id });
      assert.equal(threadBranches.length, 2);
    });
  });

  describe('3. Turn Model, Idempotency & Atomic Run Lease Locking', () => {
    it('enforces unique sequence within thread branch and sparse idempotency constraint', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Turn Constraints Thread',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
        isRoot: true,
      });

      const idempotencyKey = `idemp-${Date.now()}`;

      // Turn 1 with idempotency key
      const turn1 = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 1,
        idempotencyKey,
        status: 'pending',
      });
      assert.ok(turn1._id);

      // Duplicate turnSequence in same branch should fail
      await assert.rejects(
        async () => {
          await Turn.create({
            threadId: thread._id,
            branchId: branch._id,
            owner: testUser._id,
            turnSequence: 1,
            status: 'pending',
          });
        },
        /duplicate key error|E11000/i
      );

      // Duplicate idempotencyKey in same thread should fail
      await assert.rejects(
        async () => {
          await Turn.create({
            threadId: thread._id,
            branchId: branch._id,
            owner: testUser._id,
            turnSequence: 2,
            idempotencyKey,
            status: 'pending',
          });
        },
        /duplicate key error|E11000/i
      );

      // Turn 2 with unique sequence and null idempotencyKey succeeds
      const turn2 = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 2,
        status: 'pending',
      });
      assert.ok(turn2._id);
    });

    it('atomically manages single generation run lock and lease expiration', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Lock Test Thread',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
      });

      const turn = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 1,
      });

      const run1Id = new mongoose.Types.ObjectId().toString();
      const run2Id = new mongoose.Types.ObjectId().toString();

      // Acquire lock for Run 1 with 1000ms lease
      const lockedTurn = await Turn.acquireRunLock(turn._id, run1Id, 1000);
      assert.ok(lockedTurn);
      assert.equal(lockedTurn.runLock.holderRunId, run1Id);
      assert.equal(lockedTurn.status, 'in_progress');

      // Concurrent Run 2 attempting to acquire active lock fails
      const concurrentAttempt = await Turn.acquireRunLock(turn._id, run2Id, 1000);
      assert.equal(concurrentAttempt, null);

      // Release lock by Run 1
      const releasedTurn = await Turn.releaseRunLock(turn._id, run1Id);
      assert.ok(releasedTurn);
      assert.equal(releasedTurn.runLock.holderRunId, null);

      // Now Run 2 can successfully acquire lock
      const acquiredByRun2 = await Turn.acquireRunLock(turn._id, run2Id, 1000);
      assert.ok(acquiredByRun2);
      assert.equal(acquiredByRun2.runLock.holderRunId, run2Id);

      // Cleanup
      await Turn.releaseRunLock(turn._id, run2Id);
    });
  });

  describe('4. Message Model & Structured Multimodal Parts', () => {
    it('creates messages with structured parts (text, tool_call, tool_result, citation) and attachments', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Multimodal Message Thread',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
      });

      const turn = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 1,
      });

      // Create dummy asset for citation and attachment
      const asset = await Asset.create({
        owner: testUser._id,
        originalName: 'quarterly_report.pdf',
        sanitizedName: 'quarterly_report.pdf',
        storageKey: `users/${testUser._id}/assets/${new mongoose.Types.ObjectId()}/quarterly_report.pdf`,
        storagePath: 'storage/private/test/quarterly_report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1048576,
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        category: 'document',
        status: 'ready',
      });

      // 1. User Message with text part and attachment reference
      const userMsg = await Message.create({
        threadId: thread._id,
        branchId: branch._id,
        turnId: turn._id,
        owner: testUser._id,
        sequence: 1,
        role: 'user',
        text: 'Analyze the attached Q3 performance report.',
        parts: [
          {
            partId: 'part-1',
            type: 'text',
            text: 'Analyze the attached Q3 performance report.',
          },
        ],
        attachments: [
          {
            assetId: asset._id,
            filename: 'quarterly_report.pdf',
            originalName: 'quarterly_report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1048576,
            storageKey: asset.storageKey,
            kind: 'document',
          },
        ],
        status: 'completed',
      });
      assert.ok(userMsg._id);
      assert.equal(userMsg.role, 'user');
      assert.equal(userMsg.attachments.length, 1);
      assert.equal(userMsg.attachments[0].filename, 'quarterly_report.pdf');

      // 2. Assistant Message with text, toolCall, and citation parts
      const assistantMsg = await Message.create({
        threadId: thread._id,
        branchId: branch._id,
        turnId: turn._id,
        owner: testUser._id,
        sequence: 2,
        role: 'assistant',
        text: 'Here is the summary of the quarterly report.',
        parts: [
          {
            partId: 'part-2a',
            type: 'tool_call',
            toolCall: {
              id: 'call_search_123',
              name: 'document_search',
              args: { query: 'revenue growth' },
            },
          },
          {
            partId: 'part-2b',
            type: 'text',
            text: 'Revenue increased by 14% year over year.',
          },
          {
            partId: 'part-2c',
            type: 'source_citation',
            citation: {
              assetId: asset._id,
              checksum: asset.sha256,
              snippet: 'Revenue grew 14% to $12.4M',
              location: { page: 3, line: 42 },
            },
          },
        ],
        model: {
          provider: 'google',
          modelId: 'gemini-2.5-flash',
        },
        tokenUsage: {
          promptTokens: 120,
          completionTokens: 85,
          totalTokens: 205,
        },
        status: 'completed',
      });
      assert.ok(assistantMsg._id);
      assert.equal(assistantMsg.role, 'assistant');
      assert.equal(assistantMsg.parts.length, 3);
      assert.equal(assistantMsg.parts[0].type, 'tool_call');
      assert.equal(assistantMsg.parts[1].type, 'text');
      assert.equal(assistantMsg.parts[2].type, 'source_citation');
      assert.equal(assistantMsg.tokenUsage.totalTokens, 205);

      // Update turn pointers
      turn.userMessageId = userMsg._id;
      turn.assistantMessageIds.push(assistantMsg._id);
      turn.activeAssistantMessageId = assistantMsg._id;
      turn.status = 'completed';
      await turn.save();

      // Clean up asset
      await Asset.deleteOne({ _id: asset._id });
    });

    it('verifies cursor pagination query tuple (createdAt, _id)', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Pagination Test Thread',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
      });

      const turn = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 1,
      });

      // Insert 5 sequential messages
      const msgs = [];
      for (let i = 1; i <= 5; i++) {
        const msg = await Message.create({
          threadId: thread._id,
          branchId: branch._id,
          turnId: turn._id,
          owner: testUser._id,
          sequence: i,
          role: i % 2 === 1 ? 'user' : 'assistant',
          text: `Message ${i}`,
        });
        msgs.push(msg);
      }

      // Query page 1 (limit 2)
      const page1 = await Message.find({ threadId: thread._id })
        .sort({ createdAt: 1, _id: 1 })
        .limit(2);
      assert.equal(page1.length, 2);
      assert.equal(page1[0].text, 'Message 1');
      assert.equal(page1[1].text, 'Message 2');

      // Query page 2 using cursor of page1[1]
      const lastItem = page1[1];
      const page2 = await Message.find({
        threadId: thread._id,
        $or: [
          { createdAt: { $gt: lastItem.createdAt } },
          { createdAt: lastItem.createdAt, _id: { $gt: lastItem._id } },
        ],
      })
        .sort({ createdAt: 1, _id: 1 })
        .limit(2);

      assert.equal(page2.length, 2);
      assert.equal(page2[0].text, 'Message 3');
      assert.equal(page2[1].text, 'Message 4');
    });
  });

  describe('5. AgentRun & RunEvent Durable Replay Stream', () => {
    it('creates an AgentRun and appends ordered RunEvent records for stream replay', async () => {
      const thread = await Thread.create({
        owner: testUser._id,
        title: 'Stream Run Replay Thread',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: testUser._id,
        name: 'main',
      });

      const turn = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: testUser._id,
        turnSequence: 1,
      });

      const run = await AgentRun.create({
        threadId: thread._id,
        turnId: turn._id,
        branchId: branch._id,
        owner: testUser._id,
        model: {
          provider: 'google',
          modelId: 'gemini-2.5-flash',
        },
        status: 'started',
        startedAt: new Date(),
      });
      assert.ok(run._id);
      assert.equal(run.status, 'started');

      // Emit sequential stream events
      const event1 = await RunEvent.create({
        runId: run._id,
        threadId: thread._id,
        turnId: turn._id,
        owner: testUser._id,
        sequence: 1,
        eventId: `${run._id}:1`,
        type: 'run.started',
        data: { model: 'gemini-2.5-flash' },
      });

      const event2 = await RunEvent.create({
        runId: run._id,
        threadId: thread._id,
        turnId: turn._id,
        owner: testUser._id,
        sequence: 2,
        eventId: `${run._id}:2`,
        type: 'message.text.delta',
        data: { delta: 'Hello, ' },
      });

      const event3 = await RunEvent.create({
        runId: run._id,
        threadId: thread._id,
        turnId: turn._id,
        owner: testUser._id,
        sequence: 3,
        eventId: `${run._id}:3`,
        type: 'message.text.delta',
        data: { delta: 'world!' },
      });

      assert.ok(event1._id);
      assert.ok(event2._id);
      assert.ok(event3._id);

      // Enforce unique sequence constraint per run
      await assert.rejects(
        async () => {
          await RunEvent.create({
            runId: run._id,
            threadId: thread._id,
            turnId: turn._id,
            owner: testUser._id,
            sequence: 2, // duplicate sequence
            eventId: `${run._id}:2-dup`,
            type: 'message.text.delta',
          });
        },
        /duplicate key error|E11000/i
      );

      // Replay stream from sequence cursor (e.g. client reconnected after sequence 1)
      const missedEvents = await RunEvent.find({
        runId: run._id,
        sequence: { $gt: 1 },
      }).sort({ sequence: 1 });

      assert.equal(missedEvents.length, 2);
      assert.equal(missedEvents[0].sequence, 2);
      assert.equal(missedEvents[0].data.delta, 'Hello, ');
      assert.equal(missedEvents[1].sequence, 3);
      assert.equal(missedEvents[1].data.delta, 'world!');
    });
  });
});
