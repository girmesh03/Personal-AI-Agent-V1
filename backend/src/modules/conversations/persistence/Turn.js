/**
 * @module modules/conversations/persistence/Turn
 * @description Mongoose persistence model for logical conversational turns.
 * Encapsulates the user prompt, assistant response(s), multiple generation attempts,
 * idempotency enforcement, and generation lock/lease state.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

const runLockSchema = new mongoose.Schema(
  {
    holderRunId: {
      type: String,
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const turnErrorSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      default: null,
    },
    message: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const turnSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: [true, 'Turn must reference a Thread.'],
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageBranch',
      required: [true, 'Turn must reference a MessageBranch.'],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Turn must belong to a user.'],
      index: true,
    },
    turnSequence: {
      type: Number,
      required: [true, 'Turn sequence number is required.'],
      min: 1,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: CONVERSATION_CONSTANTS.TURN_STATUSES,
      default: 'pending',
      index: true,
    },
    userMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    assistantMessageIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Message',
        },
      ],
      default: [],
    },
    activeAssistantMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    generationAttempts: {
      type: Number,
      default: 1,
      min: 1,
    },
    activeRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentRun',
      default: null,
    },
    runLock: {
      type: runLockSchema,
      default: () => ({}),
    },
    error: {
      type: turnErrorSchema,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Compound unique sequence constraint per thread branch
turnSchema.index(
  { threadId: 1, branchId: 1, turnSequence: 1 },
  { unique: true, name: 'uniq_turn_thread_branch_sequence' }
);

// Idempotent submission guard: unique sparse per thread
turnSchema.index(
  { threadId: 1, idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'uniq_turn_thread_idempotency',
  }
);

turnSchema.index(
  { owner: 1, threadId: 1 },
  { name: 'idx_turn_owner_thread' }
);

/**
 * Atomically acquires run lock lease for generation execution.
 * Succeeds if unlocked or existing lease has expired.
 *
 * @param {import('mongoose').Types.ObjectId|string} turnId
 * @param {string} runId
 * @param {number} [leaseDurationMs=CONVERSATION_CONSTANTS.RUN_LEASE_DURATION_MS]
 * @returns {Promise<import('mongoose').Document|null>}
 */
turnSchema.statics.acquireRunLock = async function (
  turnId,
  runId,
  leaseDurationMs = CONVERSATION_CONSTANTS.RUN_LEASE_DURATION_MS
) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  return this.findOneAndUpdate(
    {
      _id: turnId,
      $or: [
        { 'runLock.holderRunId': null },
        { 'runLock.leaseExpiresAt': { $lt: now } },
        { 'runLock.holderRunId': String(runId) },
      ],
    },
    {
      $set: {
        'runLock.holderRunId': String(runId),
        'runLock.lockedAt': now,
        'runLock.leaseExpiresAt': leaseExpiresAt,
        status: 'in_progress',
      },
    },
    { returnDocument: 'after' }
  );
};

/**
 * Atomically releases run lock lease.
 *
 * @param {import('mongoose').Types.ObjectId|string} turnId
 * @param {string} runId
 * @returns {Promise<import('mongoose').Document|null>}
 */
turnSchema.statics.releaseRunLock = async function (turnId, runId) {
  return this.findOneAndUpdate(
    {
      _id: turnId,
      'runLock.holderRunId': String(runId),
    },
    {
      $set: {
        'runLock.holderRunId': null,
        'runLock.lockedAt': null,
        'runLock.leaseExpiresAt': null,
      },
    },
    { returnDocument: 'after' }
  );
};

export const Turn = mongoose.models.Turn || mongoose.model('Turn', turnSchema);

export default Turn;
