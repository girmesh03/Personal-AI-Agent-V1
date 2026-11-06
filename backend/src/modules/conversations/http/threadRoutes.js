/**
 * @module modules/conversations/http/threadRoutes
 * @description Express routing definitions for conversation threads, branch management,
 * and cursor-based message pagination (Task 4.2).
 * All endpoints require authenticated user session.
 */

import { Router } from 'express';
import { requireUser } from '../../../infrastructure/http/middleware/requireUser.js';
import { validate } from '../../../infrastructure/http/middleware/validate.js';
import * as threadController from './threadController.js';
import {
  createThreadSchema,
  updateThreadSchema,
  listThreadsSchema,
  listMessagesSchema,
  createBranchSchema,
  threadIdParamSchema,
  branchParamSchema,
} from './conversationSchemas.js';
import turnRoutes from './turnRoutes.js';
import runRoutes from './runRoutes.js';

const router = Router();

// Enforce authentication across all conversation endpoints
router.use(requireUser);

// Mount turn subroutes for both :id and :threadId route parameter conventions
router.use('/:id/turns', turnRoutes);
router.use('/:threadId/turns', turnRoutes);

// Mount run subroutes for both :id and :threadId route parameter conventions
router.use('/:id/runs', runRoutes);
router.use('/:threadId/runs', runRoutes);

// Thread collection routes
router.post('/', validate(createThreadSchema), threadController.createThread);
router.get('/', validate(listThreadsSchema), threadController.listThreads);

// Thread individual resource routes
router.get('/:id', validate(threadIdParamSchema), threadController.getThreadById);
router.patch('/:id', validate(updateThreadSchema), threadController.updateThread);
router.delete('/:id', validate(threadIdParamSchema), threadController.deleteThread);

// Thread lifecycle transitions
router.post('/:id/archive', validate(threadIdParamSchema), threadController.archiveThread);
router.post('/:id/restore', validate(threadIdParamSchema), threadController.restoreThread);

// Cursor-based message pagination
router.get('/:id/messages', validate(listMessagesSchema), threadController.listMessages);

// Branch management routes
router.get('/:id/branches', validate(threadIdParamSchema), threadController.listBranches);
router.post('/:id/branches', validate(createBranchSchema), threadController.createBranch);
router.post('/:id/branches/:branchId/switch', validate(branchParamSchema), threadController.switchBranch);

export default router;
