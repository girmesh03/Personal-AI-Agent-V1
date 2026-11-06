/**
 * @module validations/authValidation
 * @description Backward-compatibility bridge for auth validation rules using Zod.
 */

import { validate } from '../infrastructure/http/middleware/validate.js';
import {
  registerBodySchema,
  loginBodySchema,
} from '../modules/identity/http/authSchemas.js';

export * from '../modules/identity/http/authSchemas.js';

/**
 * Middleware validating user registration payload.
 */
export const registerValidation = validate({ body: registerBodySchema });

/**
 * Middleware validating user login payload.
 */
export const loginValidation = validate({ body: loginBodySchema });
