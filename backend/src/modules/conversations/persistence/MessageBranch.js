/**
 * @module modules/conversations/persistence/MessageBranch
 * @description Mongoose persistence model for conversation branches.
 * Allows conversational forking/editing without mutating parent branch history.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';

const messageBranchSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: [true, 'MessageBranch must reference a Thread.'],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'MessageBranch must belong to a user.'],
      index: true,
    },
    name: {
      type: String,
      default: 'main',
      trim: true,
    },
    parentBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageBranch',
      default: null,
    },
    forkTurnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turn',
      default: null,
    },
    forkMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isRoot: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Compound indexes
messageBranchSchema.index(
  { threadId: 1, isActive: 1 },
  { name: 'idx_branch_thread_active' }
);

messageBranchSchema.index(
  { threadId: 1, owner: 1 },
  { name: 'idx_branch_thread_owner' }
);

export const MessageBranch =
  mongoose.models.MessageBranch || mongoose.model('MessageBranch', messageBranchSchema);

export default MessageBranch;
