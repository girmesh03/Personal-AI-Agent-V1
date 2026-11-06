/**
 * @module modules/conversations/http/threadController
 * @description HTTP controller for thread management, branch forking,
 * and cursor-based message pagination (Task 4.2).
 */

import { asyncHandler } from '../../../infrastructure/http/middleware/asyncHandler.js';
import * as threadService from '../services/threadService.js';
import { HTTP_STATUS } from '../../../utils/constants.js';

export const createThread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const thread = await threadService.createThread(userId, req.body);
  res.status(HTTP_STATUS.CREATED).json({
    status: 'success',
    data: { thread },
  });
});

export const listThreads = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await threadService.listThreads(userId, req.query);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

export const getThreadById = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const thread = await threadService.getThreadById(userId, req.params.id);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { thread },
  });
});

export const updateThread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const thread = await threadService.updateThread(userId, req.params.id, req.body);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { thread },
  });
});

export const archiveThread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const thread = await threadService.archiveThread(userId, req.params.id);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { thread },
  });
});

export const restoreThread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const thread = await threadService.restoreThread(userId, req.params.id);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { thread },
  });
});

export const deleteThread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await threadService.deleteThread(userId, req.params.id);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

export const listMessages = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await threadService.listMessages(userId, req.params.id, req.query);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});

export const listBranches = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const branches = await threadService.listBranches(userId, req.params.id);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: { branches },
  });
});

export const createBranch = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const branch = await threadService.createBranch(userId, req.params.id, req.body);
  res.status(HTTP_STATUS.CREATED).json({
    status: 'success',
    data: { branch },
  });
});

export const switchBranch = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await threadService.switchBranch(userId, req.params.id, req.params.branchId);
  res.status(HTTP_STATUS.OK).json({
    status: 'success',
    data: result,
  });
});
