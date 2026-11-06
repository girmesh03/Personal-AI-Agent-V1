/**
 * @module modules/identity/http/profileRoutes
 * @description Express routes for user profile and BYOK credential configuration.
 */

import express from 'express';
import {
  getProfile,
  updateProfile,
  updateUserApiKeys,
  getApiKeyStatus,
  exportData,
  deleteUserAccount,
} from './profileController.js';
import {
  updateProfileSchema,
  updateApiKeysSchema,
} from './profileSchemas.js';
import { validate } from '../../../infrastructure/http/middleware/validate.js';
import { requireUser } from '../../../infrastructure/http/middleware/requireUser.js';

const router = express.Router();

// Require authenticated session for all profile routes
router.use(requireUser);

/**
 * @route GET /api/v1/users/profile
 * @desc Get authenticated user profile.
 */
router.get('/profile', getProfile);

/**
 * @route PATCH /api/v1/users/profile
 * @desc Update user profile attributes.
 */
router.patch('/profile', validate({ body: updateProfileSchema }), updateProfile);

/**
 * @route PATCH /api/v1/users/api-keys
 * @desc Configure BYOK provider API keys with authenticated envelope encryption.
 */
router.patch('/api-keys', validate({ body: updateApiKeysSchema }), updateUserApiKeys);

/**
 * @route GET /api/v1/users/api-keys
 * @desc Retrieve masked status of BYOK provider credentials.
 */
router.get('/api-keys', getApiKeyStatus);

/**
 * @route GET /api/v1/users/export
 * @desc Export account metadata and profile without secrets (FR-CORE-SEC-003).
 */
router.get('/export', exportData);

/**
 * @route DELETE /api/v1/users/account
 * @desc Permanently delete account and revoke all sessions (FR-CORE-SEC-003).
 */
router.delete('/account', deleteUserAccount);

export default router;
