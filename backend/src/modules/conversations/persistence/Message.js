/**
 * @module modules/conversations/persistence/Message
 * @description Mongoose persistence model for discrete conversational messages.
 * Replaces unbounded embedded message arrays with independent, ordered documents.
 * Supports multimodal parts (text, image, audio, document, tool calls, citations).
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS, SUBDOCUMENT_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { CHAT_CONSTANTS, CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

const messagePartSchema = new mongoose.Schema(
  {
    partId: {
      type: String,
      required: [true, 'Message part identifier is required.'],
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    type: {
      type: String,
      enum: CONVERSATION_CONSTANTS.PART_TYPES,
      required: [true, 'Message part type is required.'],
    },
    text: {
      type: String,
      default: '',
    },
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
    },
    toolCall: {
      id: { type: String, default: null },
      name: { type: String, default: null },
      args: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    toolResult: {
      callId: { type: String, default: null },
      name: { type: String, default: null },
      output: { type: mongoose.Schema.Types.Mixed, default: null },
      isError: { type: Boolean, default: false },
    },
    citation: {
      assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
      checksum: { type: String, default: null },
      snippet: { type: String, default: null },
      location: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

const messageAttachmentSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: [true, 'Attachment must reference an Asset.'],
    },
    filename: {
      type: String,
      required: [true, 'Attachment filename is required.'],
      trim: true,
    },
    originalName: {
      type: String,
      default: null,
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'Attachment MIME type is required.'],
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: [true, 'Attachment size is required.'],
      min: 0,
    },
    storageKey: {
      type: String,
      default: null,
      trim: true,
    },
    kind: {
      type: String,
      enum: ['document', 'image', 'audio', 'video', 'other'],
      default: 'document',
    },
  },
  SUBDOCUMENT_SCHEMA_OPTIONS
);

const messageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: [true, 'Message must reference a Thread.'],
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageBranch',
      required: [true, 'Message must reference a MessageBranch.'],
      index: true,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turn',
      required: [true, 'Message must reference a Turn.'],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message must belong to a user.'],
      index: true,
    },
    sequence: {
      type: Number,
      required: [true, 'Message sequence number is required.'],
      min: 1,
    },
    role: {
      type: String,
      enum: CONVERSATION_CONSTANTS.MESSAGE_ROLES,
      required: [true, 'Message role is required.'],
      index: true,
    },
    parts: {
      type: [messagePartSchema],
      default: [],
    },
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.MAX_MESSAGE_LENGTH,
        `Message text cannot exceed ${CHAT_CONSTANTS.MAX_MESSAGE_LENGTH} characters.`,
      ],
    },
    attachments: {
      type: [messageAttachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: CONVERSATION_CONSTANTS.MESSAGE_STATUSES,
      default: 'completed',
      index: true,
    },
    model: {
      provider: { type: String, default: null },
      modelId: { type: String, default: null },
    },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    clientMessageId: {
      type: String,
      default: null,
      trim: true,
    },
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
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

// Compound indexes
messageSchema.index(
  { threadId: 1, branchId: 1, sequence: 1 },
  { unique: true, name: 'uniq_message_thread_branch_sequence' }
);

// Cursor pagination index tuple: (createdAt, _id)
messageSchema.index(
  { threadId: 1, createdAt: 1, _id: 1 },
  { name: 'idx_message_thread_cursor_pagination' }
);

messageSchema.index(
  { threadId: 1, branchId: 1, createdAt: -1 },
  { name: 'idx_message_thread_branch_recent' }
);

messageSchema.index(
  { owner: 1, threadId: 1 },
  { name: 'idx_message_owner_thread' }
);

// Text index for conversational search across messages
messageSchema.index(
  { text: 'text' },
  { name: 'idx_message_text_search' }
);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default Message;
