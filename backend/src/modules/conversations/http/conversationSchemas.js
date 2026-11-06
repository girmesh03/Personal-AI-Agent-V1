/**
 * @module modules/conversations/http/conversationSchemas
 * @description Zod validation schemas for thread management, branch forking,
 * and cursor-based message pagination (Task 4.2).
 */

import { z } from 'zod';
import { CHAT_CONSTANTS, CONVERSATION_CONSTANTS } from '../../../utils/constants.js';

// Regex validator for MongoDB ObjectId (24 hex characters)
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ObjectId format.');

/**
 * Schema for thread creation
 */
export const createThreadSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .max(CHAT_CONSTANTS.TITLE_MAX_LENGTH, `Title cannot exceed ${CHAT_CONSTANTS.TITLE_MAX_LENGTH} characters.`)
      .optional()
      .nullable(),
    config: z
      .object({
        model: z.string().trim().optional(),
        provider: z.string().trim().optional(),
        thinkingBudget: z
          .number()
          .min(CHAT_CONSTANTS.MIN_THINKING_BUDGET)
          .max(CHAT_CONSTANTS.MAX_THINKING_BUDGET)
          .optional(),
        temperature: z.number().min(0).max(2).optional(),
        language: z.enum(CHAT_CONSTANTS.SUPPORTED_LANGUAGES).optional(),
      })
      .optional(),
    project: objectIdSchema.optional().nullable(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
});

/**
 * Schema for updating thread metadata or settings
 */
export const updateThreadSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    title: z
      .string()
      .trim()
      .max(CHAT_CONSTANTS.TITLE_MAX_LENGTH, `Title cannot exceed ${CHAT_CONSTANTS.TITLE_MAX_LENGTH} characters.`)
      .optional(),
    isPinned: z.boolean().optional(),
    config: z
      .object({
        model: z.string().trim().optional(),
        provider: z.string().trim().optional(),
        thinkingBudget: z
          .number()
          .min(CHAT_CONSTANTS.MIN_THINKING_BUDGET)
          .max(CHAT_CONSTANTS.MAX_THINKING_BUDGET)
          .optional(),
        temperature: z.number().min(0).max(2).optional(),
        language: z.enum(CHAT_CONSTANTS.SUPPORTED_LANGUAGES).optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
});

/**
 * Schema for listing threads
 */
export const listThreadsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(CONVERSATION_CONSTANTS.MAX_PAGE_SIZE).default(20).optional(),
    status: z.enum(CONVERSATION_CONSTANTS.THREAD_STATUSES).default('active').optional(),
    q: z.string().trim().optional(),
  }),
});

/**
 * Schema for cursor-based message pagination
 */
export const listMessagesSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  query: z.object({
    cursor: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(CONVERSATION_CONSTANTS.MAX_PAGE_SIZE).default(20).optional(),
    direction: z.enum(['before', 'after']).default('before').optional(),
    branchId: objectIdSchema.optional(),
  }),
});

/**
 * Schema for creating a new conversation branch
 */
export const createBranchSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z.string().trim().max(50, 'Branch name cannot exceed 50 characters.').default('branch-1').optional(),
    parentBranchId: objectIdSchema.optional().nullable(),
    forkTurnId: objectIdSchema.optional().nullable(),
    forkMessageId: objectIdSchema.optional().nullable(),
    setActive: z.boolean().default(true).optional(),
  }),
});

/**
 * Schema for thread ID parameter
 */
export const threadIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/**
 * Schema for thread & branch parameters
 */
export const branchParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
    branchId: objectIdSchema,
  }),
});
