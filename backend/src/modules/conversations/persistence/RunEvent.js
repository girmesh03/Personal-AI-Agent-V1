/**
 * @module modules/conversations/persistence/RunEvent
 * @description Mongoose persistence model for durable streaming events.
 * Keyed by run and sequence for stream replay, reconnection, and audit.
 * Bound to 7-day TTL retention policy to prevent unbounded table growth.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

const runEventSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentRun',
      required: [true, 'RunEvent must reference an AgentRun.'],
      index: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: [true, 'RunEvent must reference a Thread.'],
      index: true,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turn',
      required: [true, 'RunEvent must reference a Turn.'],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'RunEvent must belong to a user.'],
      index: true,
    },
    sequence: {
      type: Number,
      required: [true, 'Event sequence number is required.'],
      min: 1,
    },
    eventId: {
      type: String,
      required: [true, 'Event identifier is required.'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Event type is required.'],
      trim: true,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  BASE_SCHEMA_OPTIONS
);

// Unique monotonic sequence per run
runEventSchema.index(
  { runId: 1, sequence: 1 },
  { unique: true, name: 'uniq_runevent_run_sequence' }
);

runEventSchema.index(
  { threadId: 1, runId: 1, sequence: 1 },
  { name: 'idx_runevent_thread_run_replay' }
);

// TTL index to automatically purge old streaming events after retention expires (default 7 days)
runEventSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: CONVERSATION_CONSTANTS.EVENT_RETENTION_SECONDS,
    name: 'idx_runevent_ttl_expiration',
  }
);

export const RunEvent = mongoose.models.RunEvent || mongoose.model('RunEvent', runEventSchema);

export default RunEvent;
