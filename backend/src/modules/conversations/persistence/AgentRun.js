/**
 * @module modules/conversations/persistence/AgentRun
 * @description Mongoose persistence model for agent execution runs.
 * Tracks model/provider parameters, lease locks, status lifecycle, token usage, and error states.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

const agentRunModelSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: [true, 'Model provider is required.'],
      trim: true,
    },
    modelId: {
      type: String,
      required: [true, 'Model identifier is required.'],
      trim: true,
    },
  },
  { _id: false }
);

const agentRunTokenUsageSchema = new mongoose.Schema(
  {
    promptTokens: { type: Number, default: 0, min: 0 },
    completionTokens: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, default: 0, min: 0 },
    estimatedCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const agentRunLeaseSchema = new mongoose.Schema(
  {
    acquiredAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const agentRunSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: [true, 'AgentRun must reference a Thread.'],
      index: true,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turn',
      required: [true, 'AgentRun must reference a Turn.'],
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageBranch',
      required: [true, 'AgentRun must reference a MessageBranch.'],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'AgentRun must belong to a user.'],
      index: true,
    },
    model: {
      type: agentRunModelSchema,
      required: [true, 'AgentRun model configuration is required.'],
    },
    status: {
      type: String,
      enum: CONVERSATION_CONSTANTS.RUN_STATUSES,
      default: 'accepted',
      index: true,
    },
    checkpointId: {
      type: String,
      default: null,
      trim: true,
    },
    tokenUsage: {
      type: agentRunTokenUsageSchema,
      default: () => ({}),
    },
    lease: {
      type: agentRunLeaseSchema,
      default: () => ({}),
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
    },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Indexes
agentRunSchema.index(
  { threadId: 1, status: 1 },
  { name: 'idx_run_thread_status' }
);

agentRunSchema.index(
  { owner: 1, threadId: 1 },
  { name: 'idx_run_owner_thread' }
);

export const AgentRun = mongoose.models.AgentRun || mongoose.model('AgentRun', agentRunSchema);

export default AgentRun;
