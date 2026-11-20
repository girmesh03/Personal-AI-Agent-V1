/**
 * @module models/Chat
 * @description Mongoose model for conversational chat sessions and thread metadata.
 * Maps 1-to-1 to LangGraph durable checkpointer thread_id.
 * Strictly adheres to Protocol 20 & 36 (JSDoc), Protocol 21 (user isolation),
 * Protocol 58 (zero embedded message arrays), Protocol 63 (multi-provider),
 * Protocol 65 (universal user terminology), and Protocol 71 (type contracts).
 */

import mongoose from 'mongoose';
import { CHAT_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {object} IChat
 * @property {import('mongoose').Types.ObjectId} _id - Unique chat session ID (thread_id).
 * @property {import('mongoose').Types.ObjectId} user - Owning user ID (Protocol 21 user isolation).
 * @property {string} title - Human-readable chat title in sidebar drawer (max 100 chars).
 * @property {string} provider - Authoritative AI provider ('google' | 'addis') (Protocol 63).
 * @property {string} model - AI foundation model identifier.
 * @property {string|null} systemPrompt - Dynamic or per-chat system prompt override.
 * @property {number} temperature - Generation sampling temperature (0 to 2).
 * @property {boolean} isPinned - Whether chat is pinned to top of sidebar drawer.
 * @property {boolean} isArchived - Soft-archive flag separating active from archived chats.
 * @property {Date} lastMessageAt - Timestamp of latest turn activity for sidebar ordering.
 * @property {Record<string, any>} metadata - Flexible thread-level operational metadata.
 * @property {Date} createdAt - Session creation timestamp.
 * @property {Date} updatedAt - Session last modified timestamp.
 */

/**
 * Mongoose schema definition for the Chat collection.
 * @type {import('mongoose').Schema<IChat>}
 */
const chatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required.'],
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: [
        CHAT_CONSTANTS.MAX_TITLE_LENGTH,
        `Title cannot exceed ${CHAT_CONSTANTS.MAX_TITLE_LENGTH} characters.`,
      ],
      default: CHAT_CONSTANTS.DEFAULT_TITLE,
    },
    provider: {
      type: String,
      enum: {
        values: CHAT_CONSTANTS.SUPPORTED_PROVIDERS,
        message: 'Provider `{VALUE}` is not supported.',
      },
      default: CHAT_CONSTANTS.DEFAULT_PROVIDER,
    },
    model: {
      type: String,
      default: CHAT_CONSTANTS.DEFAULT_MODEL,
      trim: true,
    },
    systemPrompt: {
      type: String,
      default: null,
      trim: true,
    },
    temperature: {
      type: Number,
      min: [CHAT_CONSTANTS.MIN_TEMPERATURE, `Temperature cannot be below ${CHAT_CONSTANTS.MIN_TEMPERATURE}.`],
      max: [CHAT_CONSTANTS.MAX_TEMPERATURE, `Temperature cannot exceed ${CHAT_CONSTANTS.MAX_TEMPERATURE}.`],
      default: CHAT_CONSTANTS.DEFAULT_TEMPERATURE,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
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

// Compound Indexes for high-performance drawer queries and sidebar sorting
chatSchema.index({ user: 1, isArchived: 1, lastMessageAt: -1 });
chatSchema.index({ user: 1, isPinned: -1, lastMessageAt: -1 });

/**
 * Pre-deleteOne document middleware hook ensuring cascading deletion of associated Messages and Assets.
 */
chatSchema.pre('deleteOne', { document: true, query: false }, async function () {
  const chatId = this._id;
  await Promise.all([
    mongoose.model('Message').deleteMany({ chat: chatId }),
    mongoose.model('Asset').deleteMany({ chat: chatId }),
  ]);
});

/**
 * Pre-deleteOne query middleware hook ensuring cascading deletion on query-level deletion (e.g. Chat.deleteOne({ _id })).
 */
chatSchema.pre('deleteOne', { document: false, query: true }, async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await Promise.all([
      mongoose.model('Message').deleteMany({ chat: doc._id }),
      mongoose.model('Asset').deleteMany({ chat: doc._id }),
    ]);
  }
});

/**
 * Pre-deleteMany query middleware hook ensuring cascading deletion on bulk chat deletions.
 */
chatSchema.pre('deleteMany', async function () {
  const docs = await this.model.find(this.getQuery()).select('_id');
  const chatIds = docs.map((d) => d._id);
  if (chatIds.length > 0) {
    await Promise.all([
      mongoose.model('Message').deleteMany({ chat: { $in: chatIds } }),
      mongoose.model('Asset').deleteMany({ chat: { $in: chatIds } }),
    ]);
  }
});

/**
 * Pre-findOneAndDelete middleware hook ensuring cascading deletion on query-level deletion.
 */
chatSchema.pre('findOneAndDelete', async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await Promise.all([
      mongoose.model('Message').deleteMany({ chat: doc._id }),
      mongoose.model('Asset').deleteMany({ chat: doc._id }),
    ]);
  }
});

/**
 * Mongoose model instance for the Chat collection.
 * @type {import('mongoose').Model<IChat>}
 */
export const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
