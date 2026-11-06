/**
 * @module modules/conversations/http/turnController
 * @description HTTP controller for conversation turn lifecycle management:
 * prompt submission, retry, edit/fork, continue, cancellation, and retrieval (Task 4.3).
 * Wrapped in asyncHandler to ensure robust exception propagation.
 */

import { asyncHandler } from '../../../infrastructure/http/middleware/asyncHandler.js';
import * as turnService from '../services/turnService.js';
import { HTTP_STATUS } from '../../../utils/constants.js';

/**
 * Submits a new turn to a conversation thread.
 * Returns 201 Created for new turns, or 200 OK for idempotent replays.
 */
export const createTurn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const result = await turnService.createTurn(userId, threadId, req.body);

  const statusCode = result.idempotentReplay ? HTTP_STATUS.OK : HTTP_STATUS.CREATED;
  res.status(statusCode).json({
    status: 'success',
    data: result,
  });
});

/**
 * Retries generation for an existing turn without duplicating the user turn.
 */
export const retryTurn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turnId = req.params.turnId;
  const result = await turnService.retryTurn(userId, threadId, turnId, req.body);

  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

/**
 * Edits a previous user turn, creating a branch-isolated fork or history revision.
 */
export const editTurn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turnId = req.params.turnId;
  const result = await turnService.editTurn(userId, threadId, turnId, req.body);

  res.status(HTTP_STATUS.CREATED).json({
    status: 'success',
    data: result,
  });
});

/**
 * Continues an assistant response on a stopped/completed turn.
 */
export const continueTurn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turnId = req.params.turnId;
  const result = await turnService.continueTurn(userId, threadId, turnId, req.body);

  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

/**
 * Cancels an active turn generation run and releases locks.
 */
export const cancelTurn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turnId = req.params.turnId;
  const result = await turnService.cancelTurn(userId, threadId, turnId, req.body);

  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

/**
 * Retrieves a single turn by ID.
 */
export const getTurnById = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turnId = req.params.turnId;
  const turn = await turnService.getTurnById(userId, threadId, turnId);

  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { turn },
  });
});

/**
 * Lists turns for a thread.
 */
export const listTurns = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const threadId = req.params.threadId || req.params.id;
  const turns = await turnService.listTurns(userId, threadId, req.query);

  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { turns },
  });
});
