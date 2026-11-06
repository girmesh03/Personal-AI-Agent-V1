/**
 * @module validations/chatValidation
 * @description Backward-compatibility bridge for chat validation schemas.
 */

export * from '../modules/conversations/http/conversationSchemas.js';

// Legacy name aliases
import {
  threadIdParamSchema,
  updateThreadSchema,
  listThreadsSchema,
} from '../modules/conversations/http/conversationSchemas.js';

export const chatIdValidation = threadIdParamSchema;
export const getChatByIdValidation = threadIdParamSchema;
export const getChatsValidation = listThreadsSchema;
export const updateChatConfigValidation = updateThreadSchema;
export const renameChatValidation = updateThreadSchema;
