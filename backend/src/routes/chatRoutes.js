/**
 * @module routes/chatRoutes
 * @description Backward-compatibility bridge routing legacy V0 /api/v1/chat requests
 * to the modernized V1 threadController and conversation architecture.
 */

import { Router } from 'express';
import { requireUser } from '../infrastructure/http/middleware/requireUser.js';
import * as chatController from '../controllers/chatController.js';
import threadRoutes from '../modules/conversations/http/threadRoutes.js';

const router = Router();

// Enforce authentication across all legacy chat routes
router.use(requireUser);

// Legacy specific routes
router.patch('/:id/title', chatController.renameChat);
router.patch('/:id/pin', chatController.pinChat);
router.patch('/:id/config', chatController.updateChatConfig);

// Forward standard REST thread routes
router.use('/', threadRoutes);

export default router;
