/**
 * @module modules/identity/http/profileController
 * @description Controller for user profile management and protected BYOK credential configuration (NFR-SEC-002).
 */

import mongoose from 'mongoose';
import { User } from '../domain/User.js';
import { HTTP_STATUS } from '../../../utils/constants.js';
import { UnauthenticatedError, ConflictError } from '../../../shared/errors/AppError.js';
import { clearAuthCookies } from '../../../infrastructure/security/tokenService.js';
import { exportAccountData, deleteAccount } from '../services/accountService.js';

/**
 * Retrieves authenticated user profile.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getProfile = async (req, res) => {
  const userObj = req.user.toJSON ? req.user.toJSON() : req.user;

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Current user profile retrieved successfully.',
    data: {
      user: userObj,
    },
  });
};

/**
 * Updates editable profile attributes (firstName, lastName, email, position).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const updateProfile = async (req, res) => {
  const { firstName, lastName, email, position } = req.validated?.body || req.body || {};

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new UnauthenticatedError('User account not found.', 'USER_NOT_FOUND');
  }

  if (email && email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing._id.toString() !== user._id.toString()) {
      throw new ConflictError('Email address is already in use by another account.', 'EMAIL_ALREADY_IN_USE');
    }
    user.email = email.toLowerCase();
  }

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (position !== undefined) user.position = position;

  await user.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Profile updated successfully.',
    data: {
      user: user.toJSON ? user.toJSON() : user,
    },
  });
};

/**
 * Configures BYOK provider credentials using envelope encryption (NFR-SEC-002, Scenario U).
 * Keys are never stored in plaintext and never returned to the client.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const updateUserApiKeys = async (req, res) => {
  const { geminiApiKey, addisApiKey } = req.validated?.body || req.body || {};

  const user = await User.findById(req.user._id)
    .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey');

  if (!user) {
    throw new UnauthenticatedError('User account not found.', 'USER_NOT_FOUND');
  }

  if (geminiApiKey !== undefined) {
    user.setEncryptedApiKey('geminiApiKey', geminiApiKey);
  }

  if (addisApiKey !== undefined) {
    user.setEncryptedApiKey('addisApiKey', addisApiKey);
  }

  user.markModified('settings');
  await user.save();

  const hasGemini = Boolean(user.settings?.apiKeys?.hasGeminiKey);
  const hasAddis = Boolean(user.settings?.apiKeys?.hasAddisKey);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'API credentials updated successfully.',
    data: {
      hasGeminiKey: hasGemini,
      hasAddisKey: hasAddis,
      apiKeys: {
        hasGeminiKey: hasGemini,
        hasAddisKey: hasAddis,
      },
    },
  });
};

/**
 * Retrieves the masked status of configured BYOK credentials.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getApiKeyStatus = async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey');

  if (!user) {
    throw new UnauthenticatedError('User account not found.', 'USER_NOT_FOUND');
  }

  const hasGemini = Boolean(user.settings?.apiKeys?.hasGeminiKey);
  const hasAddis = Boolean(user.settings?.apiKeys?.hasAddisKey);

  const geminiRedacted = user.settings?.apiKeys?.geminiApiKey
    ? user.getRedactedApiKey('geminiApiKey')
    : 'Not Set';

  const addisRedacted = user.settings?.apiKeys?.addisApiKey
    ? user.getRedactedApiKey('addisApiKey')
    : 'Not Set';

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'API credential status retrieved.',
    data: {
      hasGeminiKey: hasGemini,
      hasAddisKey: hasAddis,
      geminiApiKey: geminiRedacted,
      addisApiKey: addisRedacted,
    },
  });
};

/**
 * Exports user profile and account configuration data without secrets (FR-CORE-SEC-003).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const exportData = async (req, res) => {
  const exportPayload = await exportAccountData(req.userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Account data exported successfully.',
    data: exportPayload,
  });
};

/**
 * Permanently deletes the authenticated user account and revokes active sessions (FR-CORE-SEC-003).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const deleteUserAccount = async (req, res) => {
  const result = await deleteAccount(req.userId);

  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'User account and active sessions permanently deleted.',
    data: result,
  });
};

export default {
  getProfile,
  updateProfile,
  updateUserApiKeys,
  getApiKeyStatus,
  exportData,
  deleteUserAccount,
};
