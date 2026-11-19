/**
 * @module controllers/userController
 * @description HTTP request controllers for user profile, directives, agent configuration,
 * BYOK credential updates, integration connectors (Telegram, Google Drive, Cloudinary),
 * and account deletion.
 * Strictly adheres to Protocol 20 & 36 (comprehensive JSDoc), Protocol 21 (user isolation),
 * Protocol 31 (zero utility re-exports), Protocol 35 & 44 (single canonical handler identifiers, zero aliases),
 * Protocol 42 (three-tier account deletion), Protocol 60 (strict validated data access via req.validated),
 * Protocol 65 (universal user terminology), and Protocol 66 (canonical RESTful integration hierarchy).
 */

import asyncHandler from 'express-async-handler';
import { HTTP_STATUS } from '../utils/constants.js';
import { clearAuthCookies } from '../utils/token.js';
import {
  fetchUserProfile,
  modifyUserProfile,
  modifyUserAvatar,
  clearUserAvatar,
  modifyUserPassword,
  fetchUserAgentConfiguration,
  modifyUserAgentConfiguration,
  modifyUserDirectives,
  fetchTelegramStatus,
  verifyTelegramToken,
  connectTelegramIntegration,
  disconnectTelegramIntegration,
  toggleTelegramIntegration,
  fetchGoogleDriveStatus,
  disconnectGoogleDriveIntegration,
  toggleGoogleDriveIntegration,
  fetchCloudinaryStatus,
  verifyCloudinaryCredentials,
  connectCloudinaryIntegration,
  disconnectCloudinaryIntegration,
  toggleCloudinaryIntegration,
  executeAccountDeletion,
} from '../services/userService.js';

/**
 * Retrieves the authenticated user's profile.
 * Canonical identifier replacing historical '/me' alias (Protocol 35, 44).
 *
 * @name getProfile
 * @route GET /api/v1/users/profile
 * @access Protected
 * @param {import('express').Request} req - Express request with req.user.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await fetchUserProfile(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: { user: profile },
  });
});

/**
 * Updates profile metadata for the authenticated user.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name updateProfile
 * @route PATCH /api/v1/users/profile
 * @access Protected
 * @param {import('express').Request} req - Express request with validated payload.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const updatedUser = await modifyUserProfile(req.user._id, req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Profile updated successfully.',
    data: { user: updatedUser },
  });
});

/**
 * Updates avatar cloud asset reference for the authenticated user.
 * Protocol 43: Enforces cloud storage exclusivity with zero server disk persistence.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name updateAvatar
 * @route PATCH /api/v1/users/avatar
 * @access Protected
 * @param {import('express').Request} req - Express request with validated avatar payload.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateAvatar = asyncHandler(async (req, res) => {
  const { avatar, avatarPublicId } = req.validated.body;
  const result = await modifyUserAvatar(req.user._id, { avatar, avatarPublicId });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Avatar updated successfully.',
    data: result,
  });
});

/**
 * Removes avatar asset reference for the authenticated user.
 *
 * @name removeAvatar
 * @route DELETE /api/v1/users/avatar
 * @access Protected
 * @param {import('express').Request} req - Express request with req.user.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const removeAvatar = asyncHandler(async (req, res) => {
  const result = await clearUserAvatar(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Avatar removed successfully.',
    data: result,
  });
});

/**
 * Updates password for authenticated user account.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name updatePassword
 * @route PATCH /api/v1/users/password
 * @access Protected
 * @param {import('express').Request} req - Express request with validated password payload.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;
  const result = await modifyUserPassword(req.user._id, { currentPassword, newPassword });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: result.message,
  });
});

/**
 * Retrieves agent persona, language, speech, provider, and directives configuration.
 *
 * @name getUserAgentConfig
 * @route GET /api/v1/users/agent-config
 * @access Protected
 * @param {import('express').Request} req - Express request with req.user.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getUserAgentConfig = asyncHandler(async (req, res) => {
  const config = await fetchUserAgentConfiguration(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: config,
  });
});

/**
 * Updates agent persona, model parameters, multi-provider defaults, and speech preferences.
 * Protocol 60: Reads strictly from req.validated.body.
 * Protocol 63: Supports defaultProvider alongside defaultModel.
 *
 * @name updateUserAgentConfig
 * @route PATCH /api/v1/users/agent-config
 * @access Protected
 * @param {import('express').Request} req - Express request with validated agent config payload.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateUserAgentConfig = asyncHandler(async (req, res) => {
  const updatedConfig = await modifyUserAgentConfiguration(req.user._id, req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Agent configuration updated successfully.',
    data: updatedConfig,
  });
});

/**
 * Updates user directives with strict Protocol 37 naming.
 * Protocol 60: Reads strictly from req.validated.body.
 * Protocol 65: Purged of supervisor nomenclature.
 *
 * @name updateUserDirectives
 * @route PATCH /api/v1/users/directives
 * @access Protected
 * @param {import('express').Request} req - Express request with validated directives payload.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateUserDirectives = asyncHandler(async (req, res) => {
  const updatedDirectives = await modifyUserDirectives(req.user._id, req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Directives updated successfully.',
    data: { directives: updatedDirectives },
  });
});

/**
 * Retrieves Telegram integration connection status (Protocol 66).
 *
 * @name getTelegramStatus
 * @route GET /api/v1/users/integrations/telegram/status
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getTelegramStatus = asyncHandler(async (req, res) => {
  const status = await fetchTelegramStatus(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: status,
  });
});

/**
 * Verifies a Telegram bot token against the Telegram Bot API.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name verifyTelegram
 * @route POST /api/v1/users/integrations/telegram/verify
 * @access Protected
 * @param {import('express').Request} req - Express request with botToken.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const verifyTelegram = asyncHandler(async (req, res) => {
  const { botToken } = req.validated.body;
  const result = await verifyTelegramToken(botToken);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Telegram bot token verified successfully.',
    data: result,
  });
});

/**
 * Connects Telegram integration credentials.
 * Protocol 60: Reads strictly from req.validated.body.
 * Protocol 66: Canonical /integrations/telegram/connect hierarchy.
 *
 * @name connectTelegram
 * @route PATCH /api/v1/users/integrations/telegram/connect
 * @access Protected
 * @param {import('express').Request} req - Express request with validated telegram connection data.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const connectTelegram = asyncHandler(async (req, res) => {
  const integration = await connectTelegramIntegration(req.user._id, req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Telegram integration connected successfully.',
    data: { telegram: integration },
  });
});

/**
 * Disconnects Telegram integration.
 * Protocol 66: Canonical /integrations/telegram/disconnect hierarchy.
 *
 * @name disconnectTelegram
 * @route POST /api/v1/users/integrations/telegram/disconnect
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const disconnectTelegram = asyncHandler(async (req, res) => {
  const result = await disconnectTelegramIntegration(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: result.message,
  });
});

/**
 * Toggles Telegram integration active status.
 * Protocol 60: Reads strictly from req.validated.body.enabled.
 * Protocol 66: Canonical /integrations/telegram/toggle hierarchy.
 *
 * @name toggleTelegram
 * @route PATCH /api/v1/users/integrations/telegram/toggle
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleTelegram = asyncHandler(async (req, res) => {
  const result = await toggleTelegramIntegration(req.user._id, req.validated.body.enabled);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: `Telegram integration ${result.enabled ? 'enabled' : 'disabled'}.`,
    data: result,
  });
});

/**
 * Retrieves Google Drive connection status (Protocol 34, 66).
 *
 * @name getGoogleDriveStatus
 * @route GET /api/v1/users/integrations/google-drive/status
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getGoogleDriveStatus = asyncHandler(async (req, res) => {
  const status = await fetchGoogleDriveStatus(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: status,
  });
});

/**
 * Disconnects Google Drive cloud storage integration (Protocol 34, 66).
 *
 * @name disconnectGoogleDrive
 * @route POST /api/v1/users/integrations/google-drive/disconnect
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const disconnectGoogleDrive = asyncHandler(async (req, res) => {
  const result = await disconnectGoogleDriveIntegration(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: result.message,
  });
});

/**
 * Toggles Google Drive sync active status (Protocol 34, 66).
 * Protocol 60: Reads strictly from req.validated.body.enabled.
 *
 * @name toggleGoogleDrive
 * @route PATCH /api/v1/users/integrations/google-drive/toggle
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleGoogleDrive = asyncHandler(async (req, res) => {
  const result = await toggleGoogleDriveIntegration(req.user._id, req.validated.body.enabled);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: `Google Drive integration ${result.enabled ? 'enabled' : 'disabled'}.`,
    data: result,
  });
});

/**
 * Retrieves Cloudinary cloud storage connection status (Protocol 43, 66).
 *
 * @name getCloudinaryStatus
 * @route GET /api/v1/users/integrations/cloudinary/status
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getCloudinaryStatus = asyncHandler(async (req, res) => {
  const status = await fetchCloudinaryStatus(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: status,
  });
});

/**
 * Verifies Cloudinary API credentials against Cloudinary ping endpoint (Protocol 66).
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name verifyCloudinary
 * @route POST /api/v1/users/integrations/cloudinary/verify
 * @access Protected
 * @param {import('express').Request} req - Express request with cloudName, apiKey, and apiSecret.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const verifyCloudinary = asyncHandler(async (req, res) => {
  const result = await verifyCloudinaryCredentials(req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Cloudinary credentials verified successfully.',
    data: result,
  });
});

/**
 * Connects Cloudinary integration credentials with envelope encryption at rest (Protocol 22, 66).
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name connectCloudinary
 * @route PATCH /api/v1/users/integrations/cloudinary/connect
 * @access Protected
 * @param {import('express').Request} req - Express request with validated Cloudinary credentials.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const connectCloudinary = asyncHandler(async (req, res) => {
  const integration = await connectCloudinaryIntegration(req.user._id, req.validated.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Cloudinary integration connected successfully.',
    data: { cloudinary: integration },
  });
});

/**
 * Disconnects Cloudinary integration credentials.
 * Protocol 66: Canonical /integrations/cloudinary/disconnect hierarchy.
 *
 * @name disconnectCloudinary
 * @route POST /api/v1/users/integrations/cloudinary/disconnect
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const disconnectCloudinary = asyncHandler(async (req, res) => {
  const result = await disconnectCloudinaryIntegration(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: result.message,
  });
});

/**
 * Toggles Cloudinary integration active status.
 * Protocol 60: Reads strictly from req.validated.body.enabled.
 * Protocol 66: Canonical /integrations/cloudinary/toggle hierarchy.
 *
 * @name toggleCloudinary
 * @route PATCH /api/v1/users/integrations/cloudinary/toggle
 * @access Protected
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleCloudinary = asyncHandler(async (req, res) => {
  const result = await toggleCloudinaryIntegration(req.user._id, req.validated.body.enabled);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: `Cloudinary integration ${result.enabled ? 'enabled' : 'disabled'}.`,
    data: result,
  });
});

/**
 * Executes Three-Tier Account Deletion (Protocol 42).
 * Tier 1: Data purge in database.
 * Tier 2: Authentication cookies cleared across all paths.
 * Tier 3: Client cache invalidation response dispatched.
 * Protocol 60: Reads password confirmation from req.validated.body.
 *
 * @name deleteAccount
 * @route DELETE /api/v1/users/account
 * @access Protected
 * @param {import('express').Request} req - Express request with password confirmation.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.validated?.body || {};
  const result = await executeAccountDeletion(req.user._id, password);

  // Tier 2: Irreversibly clear authentication cookies across all paths (Protocol 42)
  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: result.message,
  });
});

export default {
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
};
