/**
 * @module modules/conversations/http/turnRoutes
 * @description Express routing definitions for conversation turn lifecycle management:
 * prompt submission, retry, branch-isolated edit, continuation, cancellation, and inspection (Task 4.3).
 * Protected by requireUser authentication middleware and validated via Zod schemas.
 */

import { Router } from 'express';
import { requireUser } from '../../../infrastructure/http/middleware/requireUser.js';
import { validate } from '../../../infrastructure/http/middleware/validate.js';
import * as turnController from './turnController.js';
import {
  createTurnSchema,
  turnIdParamSchema,
  retryTurnSchema,
  editTurnSchema,
  continueTurnSchema,
  cancelTurnSchema,
  listTurnsSchema,
} from './conversationSchemas.js';

const router = Router({ mergeParams: true });

// Enforce authentication across all turn endpoints
router.use(requireUser);

// Turn collection operations
router.post('/', validate(createTurnSchema), turnController.createTurn);
router.get('/', validate(listTurnsSchema), turnController.listTurns);

// Individual turn operations
router.get('/:turnId', validate(turnIdParamSchema), turnController.getTurnById);
router.post('/:turnId/retry', validate(retryTurnSchema), turnController.retryTurn);
router.post('/:turnId/edit', validate(editTurnSchema), turnController.editTurn);
router.post('/:turnId/continue', validate(continueTurnSchema), turnController.continueTurn);
router.post('/:turnId/cancel', validate(cancelTurnSchema), turnController.cancelTurn);

export default router;
