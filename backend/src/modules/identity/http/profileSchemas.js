/**
 * @module modules/identity/http/profileSchemas
 * @description Zod validation schemas for user profile and BYOK credential updates.
 */

import { z } from 'zod';

export const updateApiKeysSchema = z.object({
  geminiApiKey: z.string().trim().nullable().optional(),
  addisApiKey: z.string().trim().nullable().optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(50).optional(),
  lastName: z.string().trim().min(2).max(50).optional(),
  email: z.string().email().trim().toLowerCase().optional(),
  position: z.string().trim().min(2).max(100).optional(),
});

export default {
  updateApiKeysSchema,
  updateProfileSchema,
};
