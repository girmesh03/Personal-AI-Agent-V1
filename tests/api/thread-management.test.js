/**
 * @file tests/api/thread-management.test.js
 * @description Integration test suite for Cursor-Based Message Pagination and Thread Management APIs (Task 4.2).
 * Exercises thread CRUD, branch forking/switching, cursor-based message pagination,
 * user isolation (NFR-SEC-004), and backward compatibility /api/v1/chat endpoints.
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
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';

describe('Task 4.2: Cursor-Based Message Pagination & Thread Management APIs', () => {
  let server;
  let baseUrl;
  let userA;
  let tokenA;
  let userB;
  let tokenB;
  const createdThreadIds = [];
  const createdUserIds = [];

  before(async () => {
    await connectDB();

    userA = await User.create({
      firstName: 'Alice',
      lastName: 'Architect',
      email: `alice.threads.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userA._id);
    tokenA = generateAccessToken(userA._id);

    userB = await User.create({
      firstName: 'Bob',
      lastName: 'Builder',
      email: `bob.threads.${Date.now()}@example.com`,
      password: 'Password123!@',
    });
    createdUserIds.push(userB._id);
    tokenB = generateAccessToken(userB._id);

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
    if (createdThreadIds.length > 0) {
      await Thread.deleteMany({ _id: { $in: createdThreadIds } });
      await MessageBranch.deleteMany({ threadId: { $in: createdThreadIds } });
      await Turn.deleteMany({ threadId: { $in: createdThreadIds } });
      await Message.deleteMany({ threadId: { $in: createdThreadIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnectDB();
  });

  describe('1. Thread Creation & Automatic Root Branch Provisioning', () => {
    it('rejects unauthenticated thread creation with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthenticated Thread' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHENTICATED');
    });

    it('creates a new thread and automatically provisions root "main" branch', async () => {
      const res = await fetch(`${baseUrl}/api/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Quarterly Strategy Planning',
          config: {
            model: 'gemini-2.5-flash',
            provider: 'google',
            thinkingBudget: 4096,
            language: 'am',
          },
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.ok(data.data.thread);
      assert.equal(data.data.thread.title, 'Quarterly Strategy Planning');
      assert.equal(data.data.thread.status, 'active');
      assert.equal(data.data.thread.isPinned, false);
      assert.ok(data.data.thread.activeBranchId);

      const threadId = data.data.thread._id || data.data.thread.id;
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
      assert.equal(rootBranch._id.toString(), data.data.thread.activeBranchId.toString());
    });
  });

  describe('2. Thread Listing, Search, Sorting & Filtering', () => {
    it('lists threads for authenticated user with status filtering and search', async () => {
      // Create additional threads for User A
      const thread1 = await Thread.create({
        owner: userA._id,
        title: 'Alpha Project Review',
        isPinned: false,
        status: 'active',
        lastMessageAt: new Date(Date.now() - 10000),
      });
      createdThreadIds.push(thread1._id);

      const thread2 = await Thread.create({
        owner: userA._id,
        title: 'Pinned Urgent Notes',
        isPinned: true,
        status: 'active',
        lastMessageAt: new Date(Date.now() - 5000),
      });
      createdThreadIds.push(thread2._id);

      const thread3 = await Thread.create({
        owner: userA._id,
        title: 'Archived Legacy Discussion',
        isPinned: false,
        status: 'archived',
        isArchived: true,
        archivedAt: new Date(),
      });
      createdThreadIds.push(thread3._id);

      // 1. List active threads (pinned should appear first)
      const listRes = await fetch(`${baseUrl}/api/v1/threads?status=active`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(listData.data.threads.length >= 2);
      assert.equal(listData.data.threads[0].isPinned, true);
      assert.equal(listData.data.threads[0].title, 'Pinned Urgent Notes');

      // 2. Search query filter
      const searchRes = await fetch(`${baseUrl}/api/v1/threads?q=Alpha`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(searchRes.status, 200);
      const searchData = await searchRes.json();
      assert.equal(searchData.data.threads.length, 1);
      assert.equal(searchData.data.threads[0].title, 'Alpha Project Review');

      // 3. List archived threads
      const archRes = await fetch(`${baseUrl}/api/v1/threads?status=archived`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(archRes.status, 200);
      const archData = await archRes.json();
      assert.ok(archData.data.threads.some((t) => t.title === 'Archived Legacy Discussion'));
    });
  });

  describe('3. Thread Resource Updates & Lifecycle Transitions', () => {
    it('updates thread title and toggles pinned state', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Original Title',
        isPinned: false,
      });
      createdThreadIds.push(thread._id);

      const patchRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Renamed Strategy Thread',
          isPinned: true,
        }),
      });

      assert.equal(patchRes.status, 200);
      const patchData = await patchRes.json();
      assert.equal(patchData.data.thread.title, 'Renamed Strategy Thread');
      assert.equal(patchData.data.thread.isPinned, true);
    });

    it('archives and restores thread via dedicated lifecycle endpoints', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Lifecycle Test Thread',
        status: 'active',
      });
      createdThreadIds.push(thread._id);

      // Archive
      const archiveRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(archiveRes.status, 200);
      const archiveData = await archiveRes.json();
      assert.equal(archiveData.data.thread.status, 'archived');
      assert.equal(archiveData.data.thread.isArchived, true);

      // Restore
      const restoreRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(restoreRes.status, 200);
      const restoreData = await restoreRes.json();
      assert.equal(restoreData.data.thread.status, 'active');
      assert.equal(restoreData.data.thread.isArchived, false);
    });

    it('soft-deletes thread and cascades soft-delete to messages', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Thread to Delete',
      });
      createdThreadIds.push(thread._id);

      const branch = await MessageBranch.create({
        threadId: thread._id,
        owner: userA._id,
        name: 'main',
      });

      const turn = await Turn.create({
        threadId: thread._id,
        branchId: branch._id,
        owner: userA._id,
        turnSequence: 1,
      });

      const message = await Message.create({
        threadId: thread._id,
        branchId: branch._id,
        turnId: turn._id,
        owner: userA._id,
        sequence: 1,
        role: 'user',
        text: 'This message will be soft-deleted.',
      });

      const deleteRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(deleteRes.status, 200);

      // Verify thread is soft-deleted
      const updatedThread = await Thread.findById(thread._id);
      assert.equal(updatedThread.isDeleted, true);

      // Verify message is soft-deleted
      const updatedMessage = await Message.findById(message._id);
      assert.equal(updatedMessage.isDeleted, true);

      // Subsequent GET returns 404
      const getRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(getRes.status, 404);
    });
  });

  describe('4. Cursor-Based Message Pagination (GET /api/v1/threads/:id/messages)', () => {
    let convoThread;
    let mainBranch;

    before(async () => {
      convoThread = await Thread.create({
        owner: userA._id,
        title: 'Long Conversation for Pagination',
      });
      createdThreadIds.push(convoThread._id);

      mainBranch = await MessageBranch.create({
        threadId: convoThread._id,
        owner: userA._id,
        name: 'main',
        isRoot: true,
      });

      convoThread.activeBranchId = mainBranch._id;
      await convoThread.save();

      const turn = await Turn.create({
        threadId: convoThread._id,
        branchId: mainBranch._id,
        owner: userA._id,
        turnSequence: 1,
      });

      // Insert 12 messages with distinct timestamps
      for (let i = 1; i <= 12; i++) {
        await Message.create({
          threadId: convoThread._id,
          branchId: mainBranch._id,
          turnId: turn._id,
          owner: userA._id,
          sequence: i,
          role: i % 2 === 1 ? 'user' : 'assistant',
          text: `Message number ${i}`,
          createdAt: new Date(Date.now() - (13 - i) * 1000),
        });
      }
    });

    it('paginates backwards (history scrolling) using cursor tuples and returns chronological slice', async () => {
      // Page 1: most recent 5 messages (limit=5, direction=before)
      const res1 = await fetch(
        `${baseUrl}/api/v1/threads/${convoThread._id}/messages?limit=5&direction=before`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert.equal(res1.status, 200);
      const data1 = await res1.json();
      assert.equal(data1.data.messages.length, 5);
      assert.equal(data1.data.pagination.hasMore, true);
      assert.ok(data1.data.pagination.nextCursor);
      // Verify chronological presentation of the slice (8, 9, 10, 11, 12)
      assert.equal(data1.data.messages[0].text, 'Message number 8');
      assert.equal(data1.data.messages[4].text, 'Message number 12');

      // Page 2: next older 5 messages using nextCursor
      const res2 = await fetch(
        `${baseUrl}/api/v1/threads/${convoThread._id}/messages?limit=5&direction=before&cursor=${data1.data.pagination.nextCursor}`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.data.messages.length, 5);
      assert.equal(data2.data.pagination.hasMore, true);
      assert.ok(data2.data.pagination.nextCursor);
      // Older slice (3, 4, 5, 6, 7)
      assert.equal(data2.data.messages[0].text, 'Message number 3');
      assert.equal(data2.data.messages[4].text, 'Message number 7');

      // Page 3: final oldest 2 messages using nextCursor
      const res3 = await fetch(
        `${baseUrl}/api/v1/threads/${convoThread._id}/messages?limit=5&direction=before&cursor=${data2.data.pagination.nextCursor}`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert.equal(res3.status, 200);
      const data3 = await res3.json();
      assert.equal(data3.data.messages.length, 2);
      assert.equal(data3.data.pagination.hasMore, false);
      assert.equal(data3.data.pagination.nextCursor, null);
      // Oldest messages (1, 2)
      assert.equal(data3.data.messages[0].text, 'Message number 1');
      assert.equal(data3.data.messages[1].text, 'Message number 2');
    });

    it('rejects malformed cursor with 400 Bad Request', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/threads/${convoThread._id}/messages?cursor=invalid-non-base64-cursor!!!`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'BAD_REQUEST');
    });
  });

  describe('5. Conversation Branching & Switching', () => {
    it('creates a new branch and switches active branch for thread', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Branching Workflow Thread',
      });
      createdThreadIds.push(thread._id);

      const rootBranch = await MessageBranch.create({
        threadId: thread._id,
        owner: userA._id,
        name: 'main',
        isRoot: true,
      });

      thread.activeBranchId = rootBranch._id;
      await thread.save();

      // 1. List branches
      const listBranchesRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/branches`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(listBranchesRes.status, 200);
      const listBranchesData = await listBranchesRes.json();
      assert.equal(listBranchesData.data.branches.length, 1);
      assert.equal(listBranchesData.data.branches[0].name, 'main');

      // 2. Fork new branch
      const forkRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/branches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'exploration-branch',
          setActive: true,
        }),
      });
      assert.equal(forkRes.status, 201);
      const forkData = await forkRes.json();
      assert.equal(forkData.data.branch.name, 'exploration-branch');
      const newBranchId = forkData.data.branch._id || forkData.data.branch.id;

      // Verify thread activeBranchId was updated
      const updatedThread = await Thread.findById(thread._id);
      assert.equal(updatedThread.activeBranchId.toString(), newBranchId.toString());

      // 3. Switch back to root branch
      const switchRes = await fetch(
        `${baseUrl}/api/v1/threads/${thread._id}/branches/${rootBranch._id}/switch`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenA}` },
        }
      );
      assert.equal(switchRes.status, 200);
      const revertedThread = await Thread.findById(thread._id);
      assert.equal(revertedThread.activeBranchId.toString(), rootBranch._id.toString());
    });
  });

  describe('6. Strict User Data Isolation (NFR-SEC-004)', () => {
    it('ensures User B receives uniform 404 NOT_FOUND when probing User A threads', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Private Confidential Thread',
      });
      createdThreadIds.push(thread._id);

      // GET thread
      const getRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(getRes.status, 404);

      // PATCH thread
      const patchRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({ title: 'Hacked Title' }),
      });
      assert.equal(patchRes.status, 404);

      // DELETE thread
      const deleteRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(deleteRes.status, 404);

      // GET messages
      const msgsRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/messages`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(msgsRes.status, 404);

      // GET branches
      const branchesRes = await fetch(`${baseUrl}/api/v1/threads/${thread._id}/branches`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(branchesRes.status, 404);
    });
  });

  describe('7. Backward-Compatibility Chat Routes (/api/v1/chat)', () => {
    it('supports legacy /api/v1/chat endpoints routing to thread persistence', async () => {
      const thread = await Thread.create({
        owner: userA._id,
        title: 'Legacy Chat Thread',
        isPinned: false,
      });
      createdThreadIds.push(thread._id);

      // 1. GET /api/v1/chat
      const listRes = await fetch(`${baseUrl}/api/v1/chat`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(listData.data.threads.some((t) => t.title === 'Legacy Chat Thread'));

      // 2. GET /api/v1/chat/:id
      const getRes = await fetch(`${baseUrl}/api/v1/chat/${thread._id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(getRes.status, 200);
      const getData = await getRes.json();
      assert.equal(getData.data.thread.title, 'Legacy Chat Thread');

      // 3. PATCH /api/v1/chat/:id/pin
      const pinRes = await fetch(`${baseUrl}/api/v1/chat/${thread._id}/pin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ isPinned: true }),
      });
      assert.equal(pinRes.status, 200);
      const pinData = await pinRes.json();
      assert.equal(pinData.data.thread.isPinned, true);

      // 4. PATCH /api/v1/chat/:id/title
      const titleRes = await fetch(`${baseUrl}/api/v1/chat/${thread._id}/title`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ title: 'Updated Legacy Title' }),
      });
      assert.equal(titleRes.status, 200);
      const titleData = await titleRes.json();
      assert.equal(titleData.data.thread.title, 'Updated Legacy Title');

      // 5. DELETE /api/v1/chat/:id
      const deleteRes = await fetch(`${baseUrl}/api/v1/chat/${thread._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(deleteRes.status, 200);
    });
  });
});
