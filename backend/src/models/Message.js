/**
 * @module models/Message
 * @description Mongoose model for individual conversational turns and tool executions.
 * Normalizes message history into first-class indexed documents.
 * Strictly adheres to Protocol 20 & 36 (JSDoc), Protocol 21 (user isolation),
 * Protocol 46 (selective HITL interrupts), Protocol 49 (monotonic sequence typing),
 * Protocol 58 (reasoning thought isolation & zero embedded arrays), and Protocol 71 (type contracts).
 */

import mongoose from 'mongoose';
import { MESSAGE_CONSTANTS, CHAT_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {object} IToolCall
 * @property {string} id - Unique tool call invocation identifier.
 * @property {string} name - Function / tool name invoked.
 * @property {Record<string, any>} args - Parsed arguments delivered to the tool.
 */

/**
 * @typedef {object} IToolResult
 * @property {string} toolCallId - Tool call identifier corresponding to the invocation.
 * @property {string} name - Name of the executed tool.
 * @property {any} result - Returned result payload from autonomous tool execution.
 * @property {boolean} isError - Whether tool execution resulted in an error.
 */

/**
 * @typedef {object} IInterrupt
 * @property {string} digest - Cryptographic SHA-256 digest of the pending action payload.
 * @property {string} actionName - Sensitive action name requiring human approval.
 * @property {Record<string, any>} payload - Action parameters presented for human review.
 * @property {'pending'|'approved'|'rejected'} status - Human approval state.
 */

/**
 * @typedef {object} IMessageUsage
 * @property {number} promptTokens - Input prompt tokens consumed.
 * @property {number} completionTokens - Output tokens generated.
 * @property {number} totalTokens - Aggregate tokens consumed.
 */

/**
 * @typedef {object} IMessageError
 * @property {string} code - Standardized error code envelope.
 * @property {string} message - Human-readable failure explanation.
 */

/**
 * @typedef {object} IMessage
 * @property {import('mongoose').Types.ObjectId} _id - Unique message ID.
 * @property {import('mongoose').Types.ObjectId} chat - Owning Chat reference (LangGraph thread_id).
 * @property {import('mongoose').Types.ObjectId} user - Owning User ID (Protocol 21 user isolation).
 * @property {number} sequence - Monotonic sequence counter (1, 2, 3...) per chat thread.
 * @property {'user'|'assistant'|'system'|'tool'} role - Conversational turn role.
 * @property {string} text - Clean textual content of user prompt or assistant completion.
 * @property {string|null} thought - Isolated reasoning deliberation tokens (Protocol 58).
 * @property {number|null} thoughtDurationMs - Reasoning duration in milliseconds.
 * @property {import('mongoose').Types.ObjectId[]} assets - Attached multimodal asset references.
 * @property {IToolCall[]|undefined} toolCalls - LangChain-compliant tool invocations.
 * @property {IToolResult|undefined} toolResult - Output payload of autonomous tool execution.
 * @property {IInterrupt|undefined} interrupt - Selective HITL approval card with SHA-256 digest.
 * @property {string|null} model - Specific model that generated this turn.
 * @property {string|null} provider - Authoritative AI provider ('google' | 'addis').
 * @property {IMessageUsage|undefined} usage - Token metrics for the turn.
 * @property {'streaming'|'completed'|'interrupted'|'cancelled'|'error'} status - Turn lifecycle state.
 * @property {IMessageError|undefined} error - Error envelope if turn execution failed.
 * @property {Date} createdAt - Turn creation timestamp.
 * @property {Date} updatedAt - Turn last modified timestamp.
 */

/**
 * Mongoose schema definition for the Message collection.
 * @type {import('mongoose').Schema<IMessage>}
 */
const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: [true, 'Chat reference is required.'],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required.'],
      index: true,
    },
    sequence: {
      type: Number,
      required: [true, 'Sequence number is required.'],
      min: [1, 'Sequence must be at least 1.'],
      validate: {
        validator: Number.isInteger,
        message: 'Sequence must be an integer.',
      },
    },
    role: {
      type: String,
      enum: {
        values: MESSAGE_CONSTANTS.ROLES,
        message: 'Role `{VALUE}` is not supported.',
      },
      required: [true, 'Message role is required.'],
    },
    text: {
      type: String,
      trim: true,
      default: '',
      maxlength: [
        MESSAGE_CONSTANTS.MAX_TEXT_LENGTH,
        `Message text cannot exceed ${MESSAGE_CONSTANTS.MAX_TEXT_LENGTH} characters.`,
      ],
    },
    thought: {
      type: String,
      trim: true,
      default: null,
    },
    thoughtDurationMs: {
      type: Number,
      min: [0, 'Thought duration cannot be negative.'],
      validate: {
        validator: (val) => val === null || val === undefined || Number.isInteger(val),
        message: 'Thought duration must be an integer number of milliseconds.',
      },
      default: null,
    },
    assets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Asset',
        },
      ],
      default: [],
    },
    toolCalls: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          name: { type: String, required: true },
          args: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        },
      ],
      default: undefined,
    },
    toolResult: {
      type: new mongoose.Schema(
        {
          toolCallId: { type: String, required: true },
          name: { type: String, required: true },
          result: { type: mongoose.Schema.Types.Mixed },
          isError: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    interrupt: {
      type: new mongoose.Schema(
        {
          digest: { type: String, required: true },
          actionName: { type: String, required: true },
          payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
          status: {
            type: String,
            enum: MESSAGE_CONSTANTS.INTERRUPT_STATUSES,
            default: MESSAGE_CONSTANTS.DEFAULT_INTERRUPT_STATUS,
          },
        },
        { _id: false }
      ),
      default: undefined,
    },
    model: {
      type: String,
      default: null,
      trim: true,
    },
    provider: {
      type: String,
      enum: {
        values: [...CHAT_CONSTANTS.SUPPORTED_PROVIDERS, null],
        message: 'Provider `{VALUE}` is not supported.',
      },
      default: null,
    },
    usage: {
      type: new mongoose.Schema(
        {
          promptTokens: { type: Number, default: 0 },
          completionTokens: { type: Number, default: 0 },
          totalTokens: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },
    status: {
      type: String,
      enum: {
        values: MESSAGE_CONSTANTS.STATUSES,
        message: 'Status `{VALUE}` is not supported.',
      },
      default: MESSAGE_CONSTANTS.DEFAULT_STATUS,
    },
    error: {
      type: new mongoose.Schema(
        {
          code: { type: String, required: true },
          message: { type: String, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
  }
);

// Compound Indexes
// Protocol 49: Strict monotonic sequencing guaranteed by unique compound index per chat
messageSchema.index({ chat: 1, sequence: 1 }, { unique: true });
// Fast reverse chronological pagination for message history
messageSchema.index({ chat: 1, createdAt: -1 });
// User-wide conversational audit and analytics queries
messageSchema.index({ user: 1, createdAt: -1 });

/**
 * Mongoose model instance for the Message collection.
 * @type {import('mongoose').Model<IMessage>}
 */
export const Message = mongoose.model('Message', messageSchema);
export default Message;
