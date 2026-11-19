/**
 * @module validations/authValidation
 * @description Zod 4 validation schemas and inferred type definitions for authentication endpoints.
 * Strictly adheres to Protocol 18 (unified validation), Protocol 32 (minimal registration payload),
 * Protocol 39 (strict validation hygiene), and Protocol 71 (strong type contracts).
 */

import { z } from 'zod';
import { PASSWORD_REGEX, EMAIL_REGEX } from '../utils/constants.js';

/**
 * @typedef {import('zod').infer<typeof registerSchema>} RegisterInput
 */

/**
 * Validation schema for account registration.
 * Protocol 32: Strictly accepts only email and password. All other properties are rejected.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const registerSchema = z
  .object({
    email: z
      .string({ required_error: 'Email address is required.' })
      .trim()
      .regex(EMAIL_REGEX, 'Please provide a valid email address.'),
    password: z
      .string({ required_error: 'Password is required.' })
      .regex(
        PASSWORD_REGEX,
        'Password must contain at least 8 characters, including 1 uppercase, 1 lowercase, 1 number, and 1 special character.'
      ),
  })
  .strict({
    message: 'Registration accepts strictly email and password. Additional fields are not permitted.',
  });

/**
 * @typedef {import('zod').infer<typeof loginSchema>} LoginInput
 */

/**
 * Validation schema for local account login.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const loginSchema = z
  .object({
    email: z
      .string({ required_error: 'Email address is required.' })
      .trim()
      .regex(EMAIL_REGEX, 'Please provide a valid email address.'),
    password: z
      .string({ required_error: 'Password is required.' })
      .min(1, 'Password is required.'),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof refreshTokenSchema>} RefreshTokenInput
 */

/**
 * Validation schema for session token refresh.
 * Protocol 17 & 61: Session renewal operates via HttpOnly cookies; optional body token supported in test mode only.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().trim().optional(),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof googleSsoCallbackSchema>} GoogleSsoCallbackInput
 */

/**
 * Validation schema for Google OAuth SSO callback query parameters.
 * Validates incoming authorization code, CSRF state, and provider error codes (Protocol 60).
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const googleSsoCallbackSchema = z
  .object({
    code: z.string().trim().optional(),
    state: z.string().trim().optional(),
    error: z.string().trim().optional(),
    error_description: z.string().trim().optional(),
  })
  .passthrough();

export default {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  googleSsoCallbackSchema,
};
