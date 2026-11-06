/**
 * @module controllers/chatController
 * @description Backward-compatibility bridge routing legacy V0 chatController requests
 * to the modernized V1 threadController.
 */

import * as threadController from '../modules/conversations/http/threadController.js';

export * from '../modules/conversations/http/threadController.js';

// Legacy method aliases
export const getChats = threadController.listThreads;
export const getChatById = threadController.getThreadById;
export const renameChat = threadController.updateThread;
export const pinChat = threadController.updateThread;
export const updateChatConfig = threadController.updateThread;
export const deleteChat = threadController.deleteThread;
