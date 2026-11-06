/**
 * @module modules/conversations/http/runEventController
 * @description HTTP controllers for durable run event logging, JSON event replay,
 * and Server-Sent Events (SSE) streaming with reconnection (Task 4.4).
 */

import { asyncHandler } from '../../../infrastructure/http/middleware/asyncHandler.js';
import { runEventService } from '../services/runEventService.js';
import { AgentRun } from '../persistence/AgentRun.js';
import { Thread } from '../persistence/Thread.js';
import { NotFoundError } from '../../../shared/errors/AppError.js';

export const runEventController = {
  /**
   * Retrieves paginated event history for a run (JSON replay endpoint).
   * Supports cursor pagination via afterSequence.
   * GET /api/v1/threads/:id/runs/:runId/events
   */
  getEvents: asyncHandler(async (req, res) => {
    const threadId = req.params.threadId || req.params.id;
    const { runId } = req.params;
    const userId = req.user.id;
    const { afterSequence = 0, limit = 100 } = req.query;

    const data = await runEventService.getEventsForReplay({
      threadId,
      runId,
      userId,
      afterSequence,
      limit,
    });

    res.status(200).json({
      success: true,
      data,
    });
  }),

  /**
   * Establishes a Server-Sent Events (SSE) live connection with historical replay.
   * Reconnects seamlessly using Last-Event-ID header or query parameter.
   * GET /api/v1/threads/:id/runs/:runId/stream
   */
  streamEvents: asyncHandler(async (req, res) => {
    const threadId = req.params.threadId || req.params.id;
    const { runId } = req.params;
    const userId = req.user.id;
    const lastEventId = req.headers['last-event-id'] || req.query?.lastEventId || req.query?.cursor;

    await runEventService.streamRunEvents({
      threadId,
      runId,
      userId,
      lastEventId,
      req,
      res,
    });
  }),

  /**
   * Records a durable event onto an existing run and publishes it to stream subscribers.
   * POST /api/v1/threads/:id/runs/:runId/events
   */
  createEvent: asyncHandler(async (req, res) => {
    const threadId = req.params.threadId || req.params.id;
    const { runId } = req.params;
    const userId = req.user.id;
    const { type, data = {}, sequence } = req.body;

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

    const envelope = await runEventService.recordEvent({
      runId: run._id,
      threadId: thread._id,
      turnId: run.turnId,
      owner: userId,
      type,
      data,
      sequence,
    });

    res.status(201).json({
      success: true,
      data: envelope,
    });
  }),
};

export default runEventController;
