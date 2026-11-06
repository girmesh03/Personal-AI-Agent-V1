/**
 * @module modules/conversations/http/runRoutes
 * @description Express router for durable agent run events and streaming.
 * Handles JSON replay, live SSE streaming with reconnection, and event recording (Task 4.4).
 */

import { Router } from 'express';
import { runEventController } from './runEventController.js';
import { validate } from '../../../infrastructure/http/middleware/validate.js';
import {
  getRunEventsSchema,
  streamRunEventsSchema,
  createRunEventSchema,
} from './conversationSchemas.js';

const router = Router({ mergeParams: true });

// JSON event replay endpoint
router.get('/:runId/events', validate(getRunEventsSchema), runEventController.getEvents);

// SSE streaming and replay endpoint
router.get('/:runId/stream', validate(streamRunEventsSchema), runEventController.streamEvents);

// Event recording endpoint (pipeline / worker)
router.post('/:runId/events', validate(createRunEventSchema), runEventController.createEvent);

export default router;
