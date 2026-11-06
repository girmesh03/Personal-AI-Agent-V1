/**
 * @module modules/conversations/services/runEventService
 * @description Durable event logging and stream replay service for agent runs.
 * Implements the canonical event stream protocol, monotonic sequence allocation,
 * cursor-based JSON replay, and resilient SSE live streaming with reconnection (Sections 11.1 & 11.3).
 */

import EventEmitter from 'node:events';
import mongoose from 'mongoose';
import { RunEvent } from '../persistence/RunEvent.js';
import { AgentRun } from '../persistence/AgentRun.js';
import { Thread } from '../persistence/Thread.js';
import { CONVERSATION_CONSTANTS } from '../../../utils/constants.js';
import { NotFoundError, BadRequestError } from '../../../shared/errors/AppError.js';
import logger from '../../../config/logger.js';

/**
 * In-memory pub/sub event bus for live streaming run events.
 * Keyed by run ID.
 */
export const runEventEmitter = new EventEmitter();
runEventEmitter.setMaxListeners(0);

/**
 * Terminal event types that deterministically end a run stream.
 * @constant
 */
export const TERMINAL_EVENT_TYPES = Object.freeze([
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

/**
 * Formats a raw RunEvent document into the canonical event envelope (Section 11.1).
 *
 * @param {Object} doc - Raw event document or object.
 * @returns {Object} Canonical event envelope.
 */
export function formatEventEnvelope(doc) {
  if (!doc) return null;
  const runId = doc.runId?.toString?.() || String(doc.runId || '');
  const threadId = doc.threadId?.toString?.() || String(doc.threadId || '');
  const turnId = doc.turnId?.toString?.() || String(doc.turnId || '');
  const sequence = Number(doc.sequence || 1);
  const eventId = doc.eventId || `${runId}:${sequence}`;
  const timestamp = doc.timestamp instanceof Date
    ? doc.timestamp.toISOString()
    : (typeof doc.timestamp === 'string' ? doc.timestamp : new Date().toISOString());

  return {
    version: 1,
    runId,
    threadId,
    turnId,
    sequence,
    eventId,
    type: doc.type,
    timestamp,
    data: doc.data || {},
  };
}

/**
 * Parses an event cursor or Last-Event-ID into a sequence number.
 * Supports both plain integer ('42') and standard event IDs ('<runId>:42').
 *
 * @param {string|number} [lastEventId]
 * @returns {number} Sequence number (defaults to 0 if invalid/empty)
 */
export function parseLastEventSequence(lastEventId) {
  if (lastEventId === undefined || lastEventId === null || lastEventId === '') {
    return 0;
  }
  const str = String(lastEventId).trim();
  if (str.includes(':')) {
    const parts = str.split(':');
    const seqStr = parts[parts.length - 1];
    const parsed = parseInt(seqStr, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  const parsed = parseInt(str, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const runEventService = {
  /**
   * Records a durable event into the RunEvent collection and publishes it to live streams.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.runId
   * @param {string|mongoose.Types.ObjectId} params.threadId
   * @param {string|mongoose.Types.ObjectId} params.turnId
   * @param {string|mongoose.Types.ObjectId} params.owner
   * @param {string} params.type - One of CONVERSATION_CONSTANTS.EVENT_FAMILIES or structured type
   * @param {Object} [params.data] - Arbitrary event payload
   * @param {number} [params.sequence] - Optional explicit monotonic sequence number
   * @returns {Promise<Object>} Persisted canonical event envelope
   */
  async recordEvent({ runId, threadId, turnId, owner, type, data = {}, sequence }) {
    if (!runId || !threadId || !turnId || !owner || !type) {
      throw new BadRequestError('runId, threadId, turnId, owner, and type are required to record a run event.');
    }

    let assignedSequence = sequence;
    if (!assignedSequence) {
      // Monotonically allocate next sequence number for this run
      const latest = await RunEvent.findOne({ runId }).sort({ sequence: -1 }).select('sequence').lean();
      assignedSequence = latest ? latest.sequence + 1 : 1;
    }

    const eventId = `${runId.toString()}:${assignedSequence}`;
    const timestamp = new Date();

    const eventDoc = await RunEvent.create({
      runId,
      threadId,
      turnId,
      owner,
      sequence: assignedSequence,
      eventId,
      type,
      data,
      timestamp,
    });

    const envelope = formatEventEnvelope(eventDoc);

    // Emit to live subscribers
    runEventEmitter.emit(`run:${runId.toString()}`, envelope);

    logger.debug(
      { runId: String(runId), eventId, type, sequence: assignedSequence },
      'Durable run event recorded and emitted'
    );

    return envelope;
  },

  /**
   * Retrieves paginated historical events for a run (JSON replay endpoint).
   * Enforces strict user isolation (NFR-SEC-004).
   *
   * @param {Object} params
   * @param {string} params.threadId
   * @param {string} params.runId
   * @param {string} params.userId
   * @param {number} [params.afterSequence=0]
   * @param {number} [params.limit=100]
   * @returns {Promise<Object>} { events, afterSequence, lastSequence, hasMore }
   */
  async getEventsForReplay({ threadId, runId, userId, afterSequence = 0, limit = 100 }) {
    // Verify thread ownership
    const thread = await Thread.findOne({ _id: threadId, owner: userId, isDeleted: false }).lean();
    if (!thread) {
      throw new NotFoundError('Thread not found.', 'NOT_FOUND');
    }

    // Verify run ownership
    const run = await AgentRun.findOne({ _id: runId, threadId, owner: userId }).lean();
    if (!run) {
      throw new NotFoundError('Run not found.', 'NOT_FOUND');
    }

    const parsedAfter = parseLastEventSequence(afterSequence);
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 100), 500);

    const query = {
      runId,
      owner: userId,
    };
    if (parsedAfter > 0) {
      query.sequence = { $gt: parsedAfter };
    }

    const rawEvents = await RunEvent.find(query)
      .sort({ sequence: 1 })
      .limit(parsedLimit + 1)
      .lean();

    const hasMore = rawEvents.length > parsedLimit;
    const eventsToReturn = hasMore ? rawEvents.slice(0, parsedLimit) : rawEvents;
    const formatted = eventsToReturn.map(formatEventEnvelope);

    const lastSequence = formatted.length > 0
      ? formatted[formatted.length - 1].sequence
      : parsedAfter;

    return {
      events: formatted,
      afterSequence: parsedAfter,
      lastSequence,
      hasMore,
    };
  },

  /**
   * Establishes a Server-Sent Events (SSE) live connection with stream replay (Section 11.1).
   * Replays historical events starting from lastEventId, then streams live events until terminal event or disconnect.
   *
   * @param {Object} params
   * @param {string} params.threadId
   * @param {string} params.runId
   * @param {string} params.userId
   * @param {string|number} [params.lastEventId] - Cursor from Last-Event-ID header or query
   * @param {import('express').Request} params.req
   * @param {import('express').Response} params.res
   */
  async streamRunEvents({ threadId, runId, userId, lastEventId, req, res }) {
    // Enforce NFR-SEC-004: verify thread and run ownership
    const thread = await Thread.findOne({ _id: threadId, owner: userId, isDeleted: false }).lean();
    if (!thread) {
      throw new NotFoundError('Thread not found.', 'NOT_FOUND');
    }

    const run = await AgentRun.findOne({ _id: runId, threadId, owner: userId }).lean();
    if (!run) {
      throw new NotFoundError('Run not found.', 'NOT_FOUND');
    }

    // Configure standard SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const afterSequence = parseLastEventSequence(
      lastEventId || req.headers['last-event-id'] || req.query?.lastEventId || req.query?.cursor
    );

    const writeSSE = (envelope) => {
      if (res.writableEnded) return;
      res.write(`id: ${envelope.eventId}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
    };

    // Replay historical persisted events
    const query = {
      runId,
      owner: userId,
    };
    if (afterSequence > 0) {
      query.sequence = { $gt: afterSequence };
    }

    const historicalEvents = await RunEvent.find(query).sort({ sequence: 1 }).lean();

    let highestDeliveredSequence = afterSequence;
    let deliveredTerminal = false;

    for (const raw of historicalEvents) {
      const envelope = formatEventEnvelope(raw);
      highestDeliveredSequence = Math.max(highestDeliveredSequence, envelope.sequence);
      writeSSE(envelope);
      if (TERMINAL_EVENT_TYPES.includes(envelope.type)) {
        deliveredTerminal = true;
      }
    }

    // If the run has already terminated, close the stream deterministically
    const isRunTerminal = ['completed', 'failed', 'cancelled'].includes(run.status);
    if (deliveredTerminal || isRunTerminal) {
      res.end();
      return;
    }

    // Subscribe to live events
    const channelKey = `run:${runId.toString()}`;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearInterval(heartbeatInterval);
      runEventEmitter.off(channelKey, onLiveEvent);
    };

    const onLiveEvent = (envelope) => {
      if (isCleanedUp || res.writableEnded) return;
      if (envelope.sequence > highestDeliveredSequence) {
        highestDeliveredSequence = envelope.sequence;
        writeSSE(envelope);
        if (TERMINAL_EVENT_TYPES.includes(envelope.type)) {
          cleanup();
          res.end();
        }
      }
    };

    runEventEmitter.on(channelKey, onLiveEvent);

    // Heartbeat to prevent intermediate proxy timeouts (every 15s)
    const heartbeatInterval = setInterval(() => {
      if (!isCleanedUp && !res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 15000);

    req.on('close', cleanup);
    res.on('finish', cleanup);
  },
};

export default runEventService;
