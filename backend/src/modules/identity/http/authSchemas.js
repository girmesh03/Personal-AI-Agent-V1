/**
 * @module modules/identity/http/authSchemas
 * @description Zod schema definitions for authentication endpoints (register, login, refresh).
 * Enforces single-user constraints (strictly zero role, zero remember-me logic).
 */

import { z } from 'zod';
import {
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
  EMAIL_REGEX,
} from '../../../utils/constants.js';

/**
 * Registration request body schema.
 */
export const registerBodySchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(USER_NAME_LENGTH.MIN, `First name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`)
      .max(USER_NAME_LENGTH.MAX, `First name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`)
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(USER_NAME_LENGTH.MIN, `Last name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`)
      .max(USER_NAME_LENGTH.MAX, `Last name must be between ${USER_NAME_LENGTH.MIN} and ${USER_NAME_LENGTH.MAX} characters.`)
      .optional(),
    email: z
      .string({ required_error: 'Email address is required.' })
      .trim()
      .toLowerCase()
      .min(1, 'Email address is required.')
      .regex(EMAIL_REGEX, 'Please provide a valid email address.'),
    password: z
      .string({ required_error: 'Password is required.' })
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
      .regex(
        PASSWORD_REGEX,
        'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'
      ),
    confirmPassword: z.string().optional(),
    position: z
      .string()
      .trim()
      .min(1, 'Position cannot be blank if provided.')
      .optional(),
    avatar: z.string().nullable().optional(),
    role: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'Role assignment is strictly prohibited in single-user architecture.',
      });
    }

    if (data.confirmPassword && data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

/**
 * Login request body schema.
 */
export const loginBodySchema = z.object({
  email: z
    .string({ required_error: 'Email address is required.' })
    .trim()
    .toLowerCase()
    .min(1, 'Email address is required.')
    .regex(EMAIL_REGEX, 'Please provide a valid email address.'),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(1, 'Password is required.'),
});

/**
 * Refresh token request schema (body fallback when cookie is unavailable).
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.').optional(),
});

// Aliases for compatibility
export const registerValidation = registerBodySchema;
export const loginValidation = loginBodySchema;

