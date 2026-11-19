/**
 * @module routes/userRoutes
 * @description User domain route definitions protected by authentication middleware.
 * Strictly adheres to Protocol 20 & 36 (JSDoc), Protocol 21 (user isolation),
 * Protocol 34 (canonical integrations hierarchy), Protocol 35 & 44 (single canonical handler identifiers),
 * Protocol 39 & 40 (strict mandatory pre-handler validation), Protocol 42 (three-tier account deletion),
 * Protocol 65 (universal user terminology), Protocol 66 (canonical RESTful integration hierarchy),
 * Protocol 70 (consolidated BYOK apiKeys under /agent-config), and Protocol 71 (strong type contracts).
 */

import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  updateProfileSchema,
  updateAvatarSchema,
  updatePasswordSchema,
  updateAgentConfigSchema,
  updateDirectivesSchema,
  verifyTelegramSchema,
  connectTelegramSchema,
  verifyCloudinarySchema,
  connectCloudinarySchema,
  toggleIntegrationSchema,
  deleteAccountSchema,
} from '../validations/userValidation.js';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  updatePassword,
  getUserAgentConfig,
  updateUserAgentConfig,
  updateUserDirectives,
  getTelegramStatus,
  verifyTelegram,
  connectTelegram,
  disconnectTelegram,
  toggleTelegram,
  getGoogleDriveStatus,
  disconnectGoogleDrive,
  toggleGoogleDrive,
  getCloudinaryStatus,
  verifyCloudinary,
  connectCloudinary,
  disconnectCloudinary,
  toggleCloudinary,
  deleteAccount,
} from '../controllers/userController.js';

/**
 * Express router instance for user domain endpoints.
 * @type {import('express').Router}
 */
const router = Router();

// Protect all user domain routes (Protocol 21 User Isolation)
router.use(protect);

/**
 * Retrieves the authenticated user's profile metadata.
 * @route GET /api/v1/users/profile
 * @access Protected
 * @controller getProfile
 * @governs Protocol 21, 35, 44
 */
router.get('/profile', getProfile);

/**
 * Updates the authenticated user's profile metadata.
 * @route PATCH /api/v1/users/profile
 * @access Protected
 * @middleware validate(updateProfileSchema)
 * @controller updateProfile
 * @governs Protocol 21, 39, 40, 60
 */
router.patch('/profile', validate(updateProfileSchema), updateProfile);

/**
 * Updates the user's avatar asset reference (Cloudinary storage).
 * @route PATCH /api/v1/users/avatar
 * @access Protected
 * @middleware validate(updateAvatarSchema)
 * @controller updateAvatar
 * @governs Protocol 43, 60
 */
router.patch('/avatar', validate(updateAvatarSchema), updateAvatar);

/**
 * Removes the user's avatar asset reference.
 * @route DELETE /api/v1/users/avatar
 * @access Protected
 * @controller removeAvatar
 * @governs Protocol 43
 */
router.delete('/avatar', removeAvatar);

/**
 * Updates account password with current password verification.
 * @route PATCH /api/v1/users/password
 * @access Protected
 * @middleware validate(updatePasswordSchema)
 * @controller updatePassword
 * @governs Protocol 21, 39, 40, 60
 */
router.patch('/password', validate(updatePasswordSchema), updatePassword);

/**
 * Retrieves user agent persona, multi-provider inference defaults, speech, and integration status.
 * @route GET /api/v1/users/agent-config
 * @access Protected
 * @controller getUserAgentConfig
 * @governs Protocol 21, 63, 70
 */
router.get('/agent-config', getUserAgentConfig);

/**
 * Updates user agent persona, inference models, speech preferences, report templates, and unified BYOK apiKeys.
 * @route PATCH /api/v1/users/agent-config
 * @access Protected
 * @middleware validate(updateAgentConfigSchema)
 * @controller updateUserAgentConfig
 * @governs Protocol 21, 22, 60, 63, 70
 */
router.patch('/agent-config', validate(updateAgentConfigSchema), updateUserAgentConfig);

/**
 * Updates canonical user behavioral directives (negative vocabulary, phrase mappings, user instructions).
 * @route PATCH /api/v1/users/directives
 * @access Protected
 * @middleware validate(updateDirectivesSchema)
 * @controller updateUserDirectives
 * @governs Protocol 37, 60, 65
 */
router.patch('/directives', validate(updateDirectivesSchema), updateUserDirectives);

/**
 * Retrieves current Telegram integration status and active configuration.
 * @route GET /api/v1/users/integrations/telegram/status
 * @access Protected
 * @controller getTelegramStatus
 * @governs Protocol 66
 */
router.get('/integrations/telegram/status', getTelegramStatus);

/**
 * Verifies validity of candidate Telegram bot token.
 * @route POST /api/v1/users/integrations/telegram/verify
 * @access Protected
 * @middleware validate(verifyTelegramSchema)
 * @controller verifyTelegram
 * @governs Protocol 39, 40, 60, 66
 */
router.post('/integrations/telegram/verify', validate(verifyTelegramSchema), verifyTelegram);

/**
 * Connects Telegram integration credentials and normalizes chat identifiers.
 * @route PATCH /api/v1/users/integrations/telegram/connect
 * @access Protected
 * @middleware validate(connectTelegramSchema)
 * @controller connectTelegram
 * @governs Protocol 22, 60, 66
 */
router.patch('/integrations/telegram/connect', validate(connectTelegramSchema), connectTelegram);

/**
 * Disconnects and purges Telegram integration credentials.
 * @route POST /api/v1/users/integrations/telegram/disconnect
 * @access Protected
 * @controller disconnectTelegram
 * @governs Protocol 66
 */
router.post('/integrations/telegram/disconnect', disconnectTelegram);

/**
 * Toggles Telegram integration active synchronization status.
 * @route PATCH /api/v1/users/integrations/telegram/toggle
 * @access Protected
 * @middleware validate(toggleIntegrationSchema)
 * @controller toggleTelegram
 * @governs Protocol 60, 66
 */
router.patch('/integrations/telegram/toggle', validate(toggleIntegrationSchema), toggleTelegram);

/**
 * Retrieves current Google Drive integration status.
 * @route GET /api/v1/users/integrations/google-drive/status
 * @access Protected
 * @controller getGoogleDriveStatus
 * @governs Protocol 34, 66
 */
router.get('/integrations/google-drive/status', getGoogleDriveStatus);

/**
 * Disconnects and purges Google Drive integration OAuth tokens.
 * @route POST /api/v1/users/integrations/google-drive/disconnect
 * @access Protected
 * @controller disconnectGoogleDrive
 * @governs Protocol 34, 66
 */
router.post('/integrations/google-drive/disconnect', disconnectGoogleDrive);

/**
 * Toggles Google Drive integration active synchronization status.
 * @route PATCH /api/v1/users/integrations/google-drive/toggle
 * @access Protected
 * @middleware validate(toggleIntegrationSchema)
 * @controller toggleGoogleDrive
 * @governs Protocol 34, 60, 66
 */
router.patch('/integrations/google-drive/toggle', validate(toggleIntegrationSchema), toggleGoogleDrive);

/**
 * Retrieves current Cloudinary integration status.
 * @route GET /api/v1/users/integrations/cloudinary/status
 * @access Protected
 * @controller getCloudinaryStatus
 * @governs Protocol 43, 66
 */
router.get('/integrations/cloudinary/status', getCloudinaryStatus);

/**
 * Verifies validity of Cloudinary API credentials against upstream API.
 * @route POST /api/v1/users/integrations/cloudinary/verify
 * @access Protected
 * @middleware validate(verifyCloudinarySchema)
 * @controller verifyCloudinary
 * @governs Protocol 43, 60, 66
 */
router.post('/integrations/cloudinary/verify', validate(verifyCloudinarySchema), verifyCloudinary);

/**
 * Connects and envelope-encrypts Cloudinary API credentials at rest.
 * @route PATCH /api/v1/users/integrations/cloudinary/connect
 * @access Protected
 * @middleware validate(connectCloudinarySchema)
 * @controller connectCloudinary
 * @governs Protocol 22, 43, 60, 66
 */
router.patch('/integrations/cloudinary/connect', validate(connectCloudinarySchema), connectCloudinary);

/**
 * Disconnects and purges Cloudinary integration credentials.
 * @route POST /api/v1/users/integrations/cloudinary/disconnect
 * @access Protected
 * @controller disconnectCloudinary
 * @governs Protocol 43, 66
 */
router.post('/integrations/cloudinary/disconnect', disconnectCloudinary);

/**
 * Toggles Cloudinary integration active storage status.
 * @route PATCH /api/v1/users/integrations/cloudinary/toggle
 * @access Protected
 * @middleware validate(toggleIntegrationSchema)
 * @controller toggleCloudinary
 * @governs Protocol 43, 60, 66
 */
router.patch('/integrations/cloudinary/toggle', validate(toggleIntegrationSchema), toggleCloudinary);

/**
 * Executes Three-Tier Account Deletion (Protocol 42).
 * Tier 1: Data purge in MongoDB.
 * Tier 2: Cookie clearing across all paths.
 * Tier 3: Client state invalidation.
 * @route DELETE /api/v1/users/account
 * @access Protected
 * @middleware validate(deleteAccountSchema)
 * @controller deleteAccount
 * @governs Protocol 42, 60
 */
router.delete('/account', validate(deleteAccountSchema), deleteAccount);

export default router;
