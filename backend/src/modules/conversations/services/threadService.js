/**
 * @module modules/conversations/services/threadService
 * @description Application service for thread management, branch forking,
 * and cursor-based message pagination (Task 4.2).
 * Strictly enforces user isolation (NFR-SEC-004).
 */

import mongoose from 'mongoose';
import { Thread } from '../persistence/Thread.js';
import { MessageBranch } from '../persistence/MessageBranch.js';
import { Message } from '../persistence/Message.js';
import { Turn } from '../persistence/Turn.js';
import { NotFoundError, BadRequestError } from '../../../shared/errors/AppError.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

/**
 * Escapes special regex characters for safe search queries.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Encodes a message cursor into a URL-safe Base64 string.
 * @param {Date|string} createdAt
 * @param {import('mongoose').Types.ObjectId|string} id
 * @returns {string}
 */
export function encodeCursor(createdAt, id) {
  const payload = {
    c: new Date(createdAt).toISOString(),
    i: id.toString(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes a URL-safe Base64 string cursor into date and ID.
 * @param {string} cursorStr
 * @returns {{ createdAt: Date, id: import('mongoose').Types.ObjectId }}
 */
export function decodeCursor(cursorStr) {
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const date = new Date(parsed.c);
    if (isNaN(date.getTime()) || !mongoose.Types.ObjectId.isValid(parsed.i)) {
      throw new Error('Malformed cursor fields');
    }
    return {
      createdAt: date,
      id: new mongoose.Types.ObjectId(parsed.i),
    };
  } catch (_e) {
    throw new BadRequestError('Invalid or malformed pagination cursor.');
  }
}

/**
 * Creates a new conversation thread with its default root branch.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} threadData
 * @returns {Promise<import('mongoose').Document>}
 */
export async function createThread(userId, threadData = {}) {
  const { title = null, config = {}, project = null, metadata = {} } = threadData;

  const thread = new Thread({
    owner: userId,
    title,
    config,
    project,
    metadata,
    status: 'active',
  });

  // Create default root branch
  const rootBranch = new MessageBranch({
    threadId: thread._id,
    owner: userId,
    name: 'main',
    isRoot: true,
    isActive: true,
  });

  thread.activeBranchId = rootBranch._id;

  await Promise.all([thread.save(), rootBranch.save()]);

  return thread;
}

/**
 * Retrieves a paginated list of threads for the authenticated user.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} options
 * @returns {Promise<{ threads: Array, pagination: object }>}
 */
export async function listThreads(userId, options = {}) {
  const {
    page = 1,
    limit = CONVERSATION_CONSTANTS.DEFAULT_PAGE_SIZE,
    status = 'active',
    q = null,
  } = options;

  const query = {
    owner: userId,
    isDeleted: false,
    status,
  };

  if (q && typeof q === 'string' && q.trim().length > 0) {
    query.title = { $regex: escapeRegex(q.trim()), $options: 'i' };
  }

  const skip = (page - 1) * limit;

  const [threads, totalCount] = await Promise.all([
    Thread.find(query)
      .sort({ isPinned: -1, lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('activeBranchId', 'name isRoot isActive')
      .lean(),
    Thread.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return {
    threads,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalCount,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Retrieves a thread by ID strictly enforcing user ownership.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function getThreadById(userId, threadId) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    throw new NotFoundError('Thread not found.');
  }

  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  }).populate('activeBranchId', 'name isRoot isActive');

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  return thread;
}

/**
 * Updates a thread's title, pin state, config, or metadata.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {object} updateData
 * @returns {Promise<import('mongoose').Document>}
 */
export async function updateThread(userId, threadId, updateData = {}) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    throw new NotFoundError('Thread not found.');
  }

  const allowedFields = ['title', 'isPinned', 'config', 'metadata'];
  const updateObj = {};

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      updateObj[field] = updateData[field];
    }
  }

  const thread = await Thread.findOneAndUpdate(
    { _id: threadId, owner: userId, isDeleted: false },
    { $set: updateObj },
    { returnDocument: 'after' }
  ).populate('activeBranchId', 'name isRoot isActive');

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  return thread;
}

/**
 * Soft-archives a thread.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function archiveThread(userId, threadId) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    throw new NotFoundError('Thread not found.');
  }

  const thread = await Thread.archiveThread(threadId, userId);
  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }
  return thread;
}

/**
 * Restores an archived thread to active state.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function restoreThread(userId, threadId) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    throw new NotFoundError('Thread not found.');
  }

  const thread = await Thread.restoreThread(threadId, userId);
  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }
  return thread;
}

/**
 * Soft-deletes a thread and cascades to messages.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @returns {Promise<{ message: string }>}
 */
export async function deleteThread(userId, threadId) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) {
    throw new NotFoundError('Thread not found.');
  }

  const thread = await Thread.softDelete(threadId, userId);
  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // Cascading soft-delete to messages
  await Message.updateMany(
    { threadId, owner: userId },
    { $set: { isDeleted: true, deletedAt: new Date() } }
  );

  return { message: 'Thread deleted successfully.' };
}

/**
 * Cursor-based message pagination along the active branch (or specified branch).
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {object} options
 * @returns {Promise<{ messages: Array, pagination: object }>}
 */
export async function listMessages(userId, threadId, options = {}) {
  const thread = await getThreadById(userId, threadId);

  const {
    cursor = null,
    limit = CONVERSATION_CONSTANTS.DEFAULT_PAGE_SIZE,
    direction = 'before',
    branchId = null,
  } = options;

  const targetBranchId = branchId || thread.activeBranchId?._id || thread.activeBranchId;

  const baseQuery = {
    threadId,
    branchId: targetBranchId,
    owner: userId,
    isDeleted: false,
  };

  let query = { ...baseQuery };
  let sortOrder = direction === 'before' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (direction === 'before') {
      query.$or = [
        { createdAt: { $lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
      ];
    } else {
      query.$or = [
        { createdAt: { $gt: decoded.createdAt } },
        { createdAt: decoded.createdAt, _id: { $gt: decoded.id } },
      ];
    }
  }

  // Fetch limit + 1 to check if there are more records
  const rawMessages = await Message.find(query)
    .sort(sortOrder)
    .limit(limit + 1)
    .lean();

  const hasMore = rawMessages.length > limit;
  let messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

  // When paginating "before" (history backwards), sort messages chronologically (oldest to newest)
  if (direction === 'before') {
    messages = messages.reverse();
  }

  let nextCursor = null;
  let prevCursor = null;

  if (messages.length > 0) {
    if (direction === 'before') {
      // nextCursor goes further back in time (from oldest message)
      nextCursor = hasMore ? encodeCursor(messages[0].createdAt, messages[0]._id) : null;
      // prevCursor goes forward in time (from newest message)
      prevCursor = encodeCursor(messages[messages.length - 1].createdAt, messages[messages.length - 1]._id);
    } else {
      // nextCursor goes further forward in time (from newest message)
      nextCursor = hasMore ? encodeCursor(messages[messages.length - 1].createdAt, messages[messages.length - 1]._id) : null;
      // prevCursor goes back in time (from oldest message)
      prevCursor = encodeCursor(messages[0].createdAt, messages[0]._id);
    }
  }

  return {
    messages,
    pagination: {
      nextCursor,
      prevCursor,
      hasMore,
      count: messages.length,
      limit,
    },
  };
}

/**
 * Retrieves all branches belonging to a thread.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @returns {Promise<Array>}
 */
export async function listBranches(userId, threadId) {
  await getThreadById(userId, threadId);

  return MessageBranch.find({
    threadId,
    owner: userId,
  })
    .sort({ createdAt: 1 })
    .lean();
}

/**
 * Creates a new branch forked from a turn/message.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {object} branchData
 * @returns {Promise<import('mongoose').Document>}
 */
export async function createBranch(userId, threadId, branchData = {}) {
  const thread = await getThreadById(userId, threadId);

  const {
    name = 'branch-1',
    parentBranchId = thread.activeBranchId?._id || thread.activeBranchId,
    forkTurnId = null,
    forkMessageId = null,
    setActive = true,
  } = branchData;

  const branch = new MessageBranch({
    threadId,
    owner: userId,
    name,
    parentBranchId,
    forkTurnId,
    forkMessageId,
    isActive: true,
    isRoot: false,
  });

  await branch.save();

  if (setActive) {
    thread.activeBranchId = branch._id;
    await thread.save();
  }

  return branch;
}

/**
 * Switches the active branch of a thread.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} branchId
 * @returns {Promise<{ activeBranchId: string }>}
 */
export async function switchBranch(userId, threadId, branchId) {
  if (!mongoose.Types.ObjectId.isValid(branchId)) {
    throw new NotFoundError('Branch not found.');
  }

  const thread = await getThreadById(userId, threadId);

  const branch = await MessageBranch.findOne({
    _id: branchId,
    threadId,
    owner: userId,
  });

  if (!branch) {
    throw new NotFoundError('Branch not found.');
  }

  thread.activeBranchId = branch._id;
  await thread.save();

  return { activeBranchId: branch._id.toString() };
}
