/**
 * @module modules/conversations/services/turnService
 * @description Domain application service for conversational turn lifecycle management:
 * normal prompt send, retry (multiple attempts per turn without duplicating user turn),
 * edit (branch-isolated history fork or explicit revision), continue (extending stopped generation),
 * and run cancellation (Task 4.3).
 * Strictly complies with Section 10 & 11 invariants and NFR-SEC-004 user isolation.
 */

import mongoose from 'mongoose';
import { Thread } from '../persistence/Thread.js';
import { Turn } from '../persistence/Turn.js';
import { Message } from '../persistence/Message.js';
import { MessageBranch } from '../persistence/MessageBranch.js';
import { AgentRun } from '../persistence/AgentRun.js';
import { Asset } from '../../assets/persistence/Asset.js';
import { runEventService } from './runEventService.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../../../shared/errors/AppError.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

/**
 * Normalizes input parts or generates text parts from string content.
 *
 * @param {string|null} content
 * @param {Array<object>} [parts=[]]
 * @returns {Array<object>}
 */
function normalizeParts(content, parts = []) {
  if (Array.isArray(parts) && parts.length > 0) {
    return parts.map((p) => ({
      partId: p.partId || new mongoose.Types.ObjectId().toString(),
      type: p.type || 'text',
      text: p.text || '',
      ...p,
    }));
  }
  if (content && typeof content === 'string' && content.trim().length > 0) {
    return [
      {
        partId: new mongoose.Types.ObjectId().toString(),
        type: 'text',
        text: content.trim(),
      },
    ];
  }
  return [];
}

/**
 * Validates and normalizes asset attachments referenced in a turn.
 * Strictly enforces user ownership of every referenced asset (NFR-SEC-004).
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Array<string|object>} attachments
 * @returns {Promise<Array<object>>}
 */
async function validateAttachments(userId, attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const validated = [];
  for (const item of attachments) {
    const assetId = typeof item === 'string' ? item : item?.assetId || item?._id;
    if (!assetId || !mongoose.Types.ObjectId.isValid(assetId)) {
      throw new BadRequestError('Invalid asset identifier in attachments.');
    }

    const asset = await Asset.findOne({
      _id: assetId,
      owner: userId,
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundError('Referenced asset not found.');
    }

    validated.push({
      assetId: asset._id,
      filename: asset.originalName || asset.sanitizedName || 'file',
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      storageKey: asset.storageKey || asset.storagePath,
      kind: asset.category || asset.kind || 'document',
    });
  }

  return validated;
}

/**
 * Submits a new turn to a conversation thread (normal prompt send).
 * Enforces idempotency via idempotencyKey, creates user message,
 * provisions agent run, and establishes turn generation lease.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {object} turnData
 * @returns {Promise<object>}
 */
export async function createTurn(userId, threadId, turnData = {}) {
  const {
    content = null,
    parts = [],
    attachments = [],
    idempotencyKey = null,
    branchId = null,
    modelSelection = null,
    metadata = {},
  } = turnData;

  // 1. Verify thread ownership (uniform 404 for missing or foreign access)
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // 2. Check idempotency: if key provided, return existing turn without creating duplicate
  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0) {
    const existingTurn = await Turn.findOne({
      threadId: thread._id,
      idempotencyKey: idempotencyKey.trim(),
    });

    if (existingTurn) {
      const userMessage = await Message.findById(existingTurn.userMessageId);
      const activeRun = existingTurn.activeRunId
        ? await AgentRun.findById(existingTurn.activeRunId)
        : null;

      return {
        turn: existingTurn,
        userMessage,
        run: activeRun,
        idempotentReplay: true,
      };
    }
  }

  // 3. Resolve active branch
  let targetBranchId = branchId || thread.activeBranchId;
  let branch = null;

  if (targetBranchId) {
    branch = await MessageBranch.findOne({
      _id: targetBranchId,
      threadId: thread._id,
      owner: userId,
    });
  }

  if (!branch) {
    // Fall back to root branch or create one if none exists
    branch = await MessageBranch.findOne({
      threadId: thread._id,
      owner: userId,
      isRoot: true,
    });

    if (!branch) {
      branch = new MessageBranch({
        threadId: thread._id,
        owner: userId,
        name: 'main',
        isRoot: true,
        isActive: true,
      });
      await branch.save();
    }
  }

  // 4. Validate non-empty content (Section 12.2: text OR at least one attachment)
  const normalizedParts = normalizeParts(content, parts);
  const validatedAttachments = await validateAttachments(userId, attachments);
  const textContent = (content && typeof content === 'string') ? content.trim() : '';

  if (textContent.length === 0 && normalizedParts.length === 0 && validatedAttachments.length === 0) {
    throw new BadRequestError('Message content or valid attachment is required.');
  }

  // 5. Calculate monotonic sequence numbers
  const lastTurn = await Turn.findOne({
    threadId: thread._id,
    branchId: branch._id,
  }).sort({ turnSequence: -1 });

  const turnSequence = lastTurn ? lastTurn.turnSequence + 1 : 1;

  const lastMsg = await Message.findOne({
    threadId: thread._id,
  }).sort({ sequence: -1 });

  const messageSequence = lastMsg ? lastMsg.sequence + 1 : 1;

  // 6. Model selection resolution
  const provider = modelSelection?.provider || thread.config?.provider || 'google';
  const modelId = modelSelection?.modelId || thread.config?.model || 'gemini-2.5-flash';

  // 7. Pre-generate IDs so documents can reference each other before save
  const turnId = new mongoose.Types.ObjectId();
  const runId = new mongoose.Types.ObjectId();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + CONVERSATION_CONSTANTS.RUN_LEASE_DURATION_MS);

  // 8. Create User Message document
  const userMessage = new Message({
    threadId: thread._id,
    branchId: branch._id,
    owner: userId,
    turnId,
    sequence: messageSequence,
    role: 'user',
    text: textContent,
    parts: normalizedParts,
    attachments: validatedAttachments,
    status: 'completed',
    model: { provider, modelId },
  });
  await userMessage.save();

  // 9. Provision AgentRun document
  const run = new AgentRun({
    _id: runId,
    threadId: thread._id,
    turnId,
    branchId: branch._id,
    owner: userId,
    model: { provider, modelId },
    status: 'accepted',
  });
  await run.save();

  // 10. Create Turn document with atomic lease lock
  const turn = new Turn({
    _id: turnId,
    threadId: thread._id,
    branchId: branch._id,
    owner: userId,
    turnSequence,
    idempotencyKey: idempotencyKey ? idempotencyKey.trim() : undefined,
    status: 'in_progress',
    userMessageId: userMessage._id,
    assistantMessageIds: [],
    generationAttempts: 1,
    activeRunId: run._id,
    runLock: {
      holderRunId: String(run._id),
      lockedAt: now,
      leaseExpiresAt,
    },
    metadata,
  });
  await turn.save();

  // 11. Update thread activity counters and timestamp
  await Thread.updateOne(
    { _id: thread._id },
    {
      $inc: { turnCount: 1, messageCount: 1 },
      $set: {
        lastMessageAt: now,
        activeBranchId: branch._id,
      },
    }
  );

  // 12. Record initial run.accepted event
  try {
    await runEventService.recordEvent({
      runId: run._id,
      threadId: thread._id,
      turnId: turn._id,
      owner: userId,
      type: 'run.accepted',
      data: {
        turnSequence: turn.turnSequence,
        modelSelection: run.model,
        status: run.status,
      },
    });
  } catch (_e) {
    // Non-blocking event logging failure
  }

  return {
    turn,
    userMessage,
    run,
    idempotentReplay: false,
  };
}

/**
 * Retries generation for an existing turn.
 * Section 10.2 invariant: "Retry creates a new generation attempt for the same logical user turn;
 * it does not create a duplicate user turn."
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} turnId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function retryTurn(userId, threadId, turnId, options = {}) {
  const { modelSelection = null } = options;

  // 1. Verify thread ownership
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // 2. Verify turn ownership
  const turn = await Turn.findOne({
    _id: turnId,
    threadId: thread._id,
    owner: userId,
  });

  if (!turn) {
    throw new NotFoundError('Turn not found.');
  }

  // 3. Check for active unexpired lease lock
  const now = new Date();
  if (
    turn.runLock?.holderRunId &&
    turn.runLock?.leaseExpiresAt &&
    new Date(turn.runLock.leaseExpiresAt) > now
  ) {
    throw new ConflictError(
      'Turn is currently undergoing active generation. Please cancel the current run or wait for lease expiration.'
    );
  }

  // 4. Resolve model parameters
  const provider = modelSelection?.provider || thread.config?.provider || 'google';
  const modelId = modelSelection?.modelId || thread.config?.model || 'gemini-2.5-flash';

  // 5. Provision a new AgentRun for the new attempt
  const run = new AgentRun({
    threadId: thread._id,
    turnId: turn._id,
    branchId: turn.branchId,
    owner: userId,
    model: { provider, modelId },
    status: 'accepted',
  });
  await run.save();

  // 6. Increment generation attempts and update turn's active run
  turn.generationAttempts = (turn.generationAttempts || 1) + 1;
  turn.activeRunId = run._id;
  await turn.save();

  // 7. Atomically acquire run lock for the new run
  const updatedTurn = await Turn.acquireRunLock(turn._id, run._id);

  // 8. Record run.accepted event for new retry run
  try {
    await runEventService.recordEvent({
      runId: run._id,
      threadId: thread._id,
      turnId: turn._id,
      owner: userId,
      type: 'run.accepted',
      data: {
        generationAttempt: turn.generationAttempts,
        modelSelection: run.model,
        status: run.status,
      },
    });
  } catch (_e) {
    // Non-blocking event logging failure
  }

  return {
    turn: updatedTurn,
    run,
  };
}

/**
 * Edits a previous user turn.
 * Section 10.2 invariant: "Edit creates a new branch or explicit history revision from the edited turn;
 * dependent downstream history must not be silently mixed with the old path."
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} turnId
 * @param {object} editData
 * @returns {Promise<object>}
 */
export async function editTurn(userId, threadId, turnId, editData = {}) {
  const {
    content = null,
    parts = [],
    attachments = [],
    forkBranch = true,
    branchName = null,
    modelSelection = null,
  } = editData;

  // 1. Verify thread ownership
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // 2. Verify turn ownership
  const turn = await Turn.findOne({
    _id: turnId,
    threadId: thread._id,
    owner: userId,
  });

  if (!turn) {
    throw new NotFoundError('Turn not found.');
  }

  // 3. Validate content / attachments
  const normalizedParts = normalizeParts(content, parts);
  const validatedAttachments = await validateAttachments(userId, attachments);
  const textContent = (content && typeof content === 'string') ? content.trim() : '';

  if (textContent.length === 0 && normalizedParts.length === 0 && validatedAttachments.length === 0) {
    throw new BadRequestError('Message content or valid attachment is required.');
  }

  const provider = modelSelection?.provider || thread.config?.provider || 'google';
  const modelId = modelSelection?.modelId || thread.config?.model || 'gemini-2.5-flash';

  // 4. Branch-isolated edit (default): creates a new branch from this fork point
  if (forkBranch !== false) {
    const name = branchName || `edit-turn-${turn.turnSequence}`;

    const newBranch = new MessageBranch({
      threadId: thread._id,
      owner: userId,
      parentBranchId: turn.branchId,
      forkTurnId: turn._id,
      forkMessageId: turn.userMessageId,
      name,
      isActive: true,
      isRoot: false,
    });
    await newBranch.save();

    // Determine message sequence
    const lastMsg = await Message.findOne({ threadId: thread._id }).sort({ sequence: -1 });
    const msgSeq = lastMsg ? lastMsg.sequence + 1 : 1;

    // Pre-generate IDs
    const newTurnId = new mongoose.Types.ObjectId();
    const runId = new mongoose.Types.ObjectId();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + CONVERSATION_CONSTANTS.RUN_LEASE_DURATION_MS);

    // Create new user message on the new branch
    const userMessage = new Message({
      threadId: thread._id,
      branchId: newBranch._id,
      turnId: newTurnId,
      owner: userId,
      sequence: msgSeq,
      role: 'user',
      text: textContent,
      parts: normalizedParts,
      attachments: validatedAttachments,
      status: 'completed',
      model: { provider, modelId },
    });
    await userMessage.save();

    // Provision new AgentRun
    const run = new AgentRun({
      _id: runId,
      threadId: thread._id,
      turnId: newTurnId,
      branchId: newBranch._id,
      owner: userId,
      model: { provider, modelId },
      status: 'accepted',
    });
    await run.save();

    // Create new Turn on the new branch
    const newTurn = new Turn({
      _id: newTurnId,
      threadId: thread._id,
      branchId: newBranch._id,
      owner: userId,
      turnSequence: turn.turnSequence,
      status: 'in_progress',
      userMessageId: userMessage._id,
      assistantMessageIds: [],
      generationAttempts: 1,
      activeRunId: run._id,
      runLock: {
        holderRunId: String(run._id),
        lockedAt: now,
        leaseExpiresAt,
      },
    });
    await newTurn.save();

    // Update thread to point to the new active branch
    await Thread.updateOne(
      { _id: thread._id },
      {
        $inc: { turnCount: 1, messageCount: 1 },
        $set: {
          activeBranchId: newBranch._id,
          lastMessageAt: now,
        },
      }
    );

    return {
      branch: newBranch,
      turn: newTurn,
      userMessage,
      run,
    };
  }

  // 5. In-place revision mode: updates user message and provisions new generation attempt
  const userMessage = await Message.findById(turn.userMessageId);
  if (!userMessage) {
    throw new NotFoundError('Associated user message not found.');
  }

  userMessage.metadata = {
    ...userMessage.metadata,
    isEdited: true,
    previousText: userMessage.text,
    editedAt: new Date(),
  };
  userMessage.text = textContent;
  userMessage.parts = normalizedParts;
  userMessage.attachments = validatedAttachments;
  await userMessage.save();

  // Provision new generation run
  const run = new AgentRun({
    threadId: thread._id,
    turnId: turn._id,
    branchId: turn.branchId,
    owner: userId,
    model: { provider, modelId },
    status: 'accepted',
  });
  await run.save();

  turn.generationAttempts = (turn.generationAttempts || 1) + 1;
  turn.activeRunId = run._id;
  await turn.save();

  const updatedTurn = await Turn.acquireRunLock(turn._id, run._id);

  return {
    turn: updatedTurn,
    userMessage,
    run,
  };
}

/**
 * Continues an assistant response on a stopped/completed turn.
 * Section 10.2 invariant: "Continue extends a stopped/partial assistant generation only where supported;
 * it must not resubmit a duplicate user turn."
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} turnId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function continueTurn(userId, threadId, turnId, options = {}) {
  const { modelSelection = null } = options;

  // 1. Verify thread ownership
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // 2. Verify turn ownership
  const turn = await Turn.findOne({
    _id: turnId,
    threadId: thread._id,
    owner: userId,
  });

  if (!turn) {
    throw new NotFoundError('Turn not found.');
  }

  // 3. Resolve model
  const provider = modelSelection?.provider || thread.config?.provider || 'google';
  const modelId = modelSelection?.modelId || thread.config?.model || 'gemini-2.5-flash';

  // 4. Provision a new AgentRun marked as continuation
  const run = new AgentRun({
    threadId: thread._id,
    turnId: turn._id,
    branchId: turn.branchId,
    owner: userId,
    model: { provider, modelId },
    status: 'accepted',
    metadata: {
      isContinuation: true,
      previousRunId: turn.activeRunId ? String(turn.activeRunId) : null,
    },
  });
  await run.save();

  // 5. Update turn's active run and acquire lock
  turn.activeRunId = run._id;
  await turn.save();

  const updatedTurn = await Turn.acquireRunLock(turn._id, run._id);

  // 6. Record run.accepted event for continuation run
  try {
    await runEventService.recordEvent({
      runId: run._id,
      threadId: thread._id,
      turnId: turn._id,
      owner: userId,
      type: 'run.accepted',
      data: {
        isContinuation: true,
        modelSelection: run.model,
        status: run.status,
      },
    });
  } catch (_e) {
    // Non-blocking event logging failure
  }

  return {
    turn: updatedTurn,
    run,
  };
}

/**
 * Cancels an active turn generation run.
 * Section 11.3: Cancellation protocol.
 * Sets AgentRun to 'cancelled', releases turn run lock, and sets turn to 'cancelled'.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} turnId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function cancelTurn(userId, threadId, turnId, options = {}) {
  const { reason = 'user_requested' } = options;

  // 1. Verify thread ownership
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  // 2. Verify turn ownership
  const turn = await Turn.findOne({
    _id: turnId,
    threadId: thread._id,
    owner: userId,
  });

  if (!turn) {
    throw new NotFoundError('Turn not found.');
  }

  // 3. Cancel active run if present
  let run = null;
  if (turn.activeRunId) {
    run = await AgentRun.findOne({
      _id: turn.activeRunId,
      owner: userId,
    });

    if (run) {
      run.status = 'cancelled';
      run.cancellationReason = reason;
      run.completedAt = new Date();
      await run.save();

      // Record cancel_requested and cancelled events
      try {
        await runEventService.recordEvent({
          runId: run._id,
          threadId: thread._id,
          turnId: turn._id,
          owner: userId,
          type: 'run.cancel_requested',
          data: { reason },
        });
        await runEventService.recordEvent({
          runId: run._id,
          threadId: thread._id,
          turnId: turn._id,
          owner: userId,
          type: 'run.cancelled',
          data: { reason },
        });
      } catch (_e) {
        // Non-blocking event logging failure
      }
    }

    await Turn.releaseRunLock(turn._id, turn.activeRunId);
  }

  // 4. Transition turn status to cancelled
  turn.status = 'cancelled';
  await turn.save();

  return {
    turn,
    run,
    cancelled: true,
  };
}

/**
 * Retrieves a single turn with its associated user and assistant messages.
 * Enforces uniform 404 for missing or foreign access (NFR-SEC-004).
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {string|import('mongoose').Types.ObjectId} turnId
 * @returns {Promise<object>}
 */
export async function getTurnById(userId, threadId, turnId) {
  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  const turn = await Turn.findOne({
    _id: turnId,
    threadId: thread._id,
    owner: userId,
  })
    .populate('userMessageId')
    .populate('assistantMessageIds')
    .populate('activeAssistantMessageId');

  if (!turn) {
    throw new NotFoundError('Turn not found.');
  }

  return turn;
}

/**
 * Lists turns for a thread branch.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} threadId
 * @param {object} [query={}]
 * @returns {Promise<Array<object>>}
 */
export async function listTurns(userId, threadId, query = {}) {
  const { branchId = null, limit = 50 } = query;

  const thread = await Thread.findOne({
    _id: threadId,
    owner: userId,
    isDeleted: false,
  });

  if (!thread) {
    throw new NotFoundError('Thread not found.');
  }

  const targetBranchId = branchId || thread.activeBranchId;
  const filter = {
    threadId: thread._id,
    owner: userId,
  };

  if (targetBranchId) {
    filter.branchId = targetBranchId;
  }

  const turns = await Turn.find(filter)
    .sort({ turnSequence: 1 })
    .limit(limit)
    .populate('userMessageId')
    .populate('activeAssistantMessageId');

  return turns;
}
