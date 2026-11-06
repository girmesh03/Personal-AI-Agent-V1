/**
 * @module modules/identity/services/accountService
 * @description Account lifecycle services for data export and permanent account deletion (FR-CORE-SEC-003).
 */

import { User } from '../domain/User.js';
import { Session } from '../domain/Session.js';
import { AuthIdentity } from '../domain/AuthIdentity.js';
import { NotFoundError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../config/logger.js';

/**
 * Exports user data structure for download without exposing any secrets (FR-CORE-SEC-003).
 *
 * @param {string} userId
 * @returns {Promise<object>} Export bundle
 */
export const exportAccountData = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User account not found.', 'USER_NOT_FOUND');
  }

  const identities = await AuthIdentity.find({ userId }).select('-profileData.accessToken -profileData.refreshToken');

  const userJson = user.toJSON ? user.toJSON() : user;

  // Build structured export archive payload
  return {
    version: '1.0.0',
    exportTimestamp: new Date().toISOString(),
    account: {
      id: userJson.id,
      firstName: userJson.firstName,
      lastName: userJson.lastName,
      fullName: userJson.fullName,
      email: userJson.email,
      position: userJson.position,
      authProvider: userJson.authProvider,
      settings: userJson.settings,
      createdAt: userJson.createdAt,
      updatedAt: userJson.updatedAt,
    },
    linkedIdentities: identities.map((id) => ({
      provider: id.provider,
      providerId: id.providerId,
      createdAt: id.createdAt,
    })),
  };
};

/**
 * Permanently deletes user account, active sessions, and linked auth identities (FR-CORE-SEC-003).
 *
 * @param {string} userId
 * @returns {Promise<{ deletedSessions: number, deletedIdentities: number }>}
 */
export const deleteAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User account not found.', 'USER_NOT_FOUND');
  }

  const [sessionResult, identityResult] = await Promise.all([
    Session.deleteMany({ userId }),
    AuthIdentity.deleteMany({ userId }),
    User.findByIdAndDelete(userId),
  ]);

  logger.info(`[accountService] User account permanently deleted: ${user.email} (id: ${userId})`);

  return {
    deletedSessions: sessionResult.deletedCount,
    deletedIdentities: identityResult.deletedCount,
  };
};

export default {
  exportAccountData,
  deleteAccount,
};
