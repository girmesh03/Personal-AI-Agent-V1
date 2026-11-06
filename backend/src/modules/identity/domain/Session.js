/**
 * @module modules/identity/domain/Session
 * @description Mongoose model for server-side session registry, token rotation lineage, and breach detection.
 */

import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { UnauthenticatedError } from '../../../shared/errors/AppError.js';

/**
 * Computes deterministic SHA-256 hash of a raw token string.
 * Ensures raw tokens are never stored in plaintext in the database.
 * @param {string} token
 * @returns {string} Hex-encoded SHA-256 digest.
 */
export const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: [true, 'Refresh token hash is required.'],
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: [true, 'Session family lineage identifier is required.'],
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required.'],
      index: { expires: 0 }, // MongoDB TTL index: automatically deletes expired session documents
    },
  },
  BASE_SCHEMA_OPTIONS
);

/**
 * Creates and registers a new active session family.
 * @param {Object} params
 * @param {mongoose.Types.ObjectId|string} params.userId
 * @param {string} params.refreshToken
 * @param {string} [params.userAgent]
 * @param {string} [params.ipAddress]
 * @param {number} [params.expiresInMs=604800000] - Default 7 days
 * @returns {Promise<mongoose.Document>}
 */
sessionSchema.statics.createSession = async function createSession({
  userId,
  refreshToken,
  userAgent = null,
  ipAddress = null,
  expiresInMs = 7 * 24 * 60 * 60 * 1000,
}) {
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const family = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInMs);

  return this.create({
    userId,
    refreshTokenHash,
    family,
    userAgent,
    ipAddress,
    isRevoked: false,
    expiresAt,
  });
};

/**
 * Validates a refresh token against the session registry.
 * Detects token reuse/replay attacks and revokes the entire session lineage if reuse occurs.
 * @param {string} refreshToken
 * @returns {Promise<mongoose.Document>}
 */
sessionSchema.statics.validateSession = async function validateSession(refreshToken) {
  if (!refreshToken) {
    throw new UnauthenticatedError('Refresh token is required.', 'NO_REFRESH_TOKEN');
  }

  const refreshTokenHash = hashRefreshToken(refreshToken);
  const session = await this.findOne({ refreshTokenHash });

  if (!session) {
    throw new UnauthenticatedError('Session not found or already terminated.', 'SESSION_NOT_FOUND');
  }

  // Token reuse / replay attack detection:
  // If a client attempts to refresh using a token that was already rotated (revoked),
  // someone may have intercepted the old token. Terminate the entire session family immediately!
  if (session.isRevoked) {
    await this.updateMany({ family: session.family }, { $set: { isRevoked: true } });
    throw new UnauthenticatedError(
      'Security warning: Attempted reuse of an invalidated refresh token. All associated sessions have been terminated. Please log in again.',
      'TOKEN_REUSE_DETECTED'
    );
  }

  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    session.isRevoked = true;
    await session.save();
    throw new UnauthenticatedError('Session has expired. Please log in again.', 'SESSION_EXPIRED');
  }

  return session;
};

/**
 * Rotates a refresh token within its existing session family.
 * Marks the old token revoked and stores the new token in the same lineage.
 * Supports both options object and positional arguments for maximum robustness.
 *
 * @param {Object|string} oldOrParams
 * @param {string} [newRefreshTokenPos]
 * @param {Object} [options]
 * @returns {Promise<mongoose.Document>} The newly created session.
 */
sessionSchema.statics.rotateSession = async function rotateSession(
  oldOrParams,
  newRefreshTokenPos,
  options = {}
) {
  let oldRefreshToken;
  let newRefreshToken;
  let userAgent = null;
  let ipAddress = null;
  let expiresInMs = 7 * 24 * 60 * 60 * 1000;

  if (typeof oldOrParams === 'object' && oldOrParams !== null) {
    oldRefreshToken = oldOrParams.oldRefreshToken;
    newRefreshToken = oldOrParams.newRefreshToken;
    userAgent = oldOrParams.userAgent || null;
    ipAddress = oldOrParams.ipAddress || null;
    expiresInMs = oldOrParams.expiresInMs || expiresInMs;
  } else {
    oldRefreshToken = oldOrParams;
    newRefreshToken = newRefreshTokenPos;
    userAgent = options.userAgent || null;
    ipAddress = options.ipAddress || null;
    expiresInMs = options.expiresInMs || expiresInMs;
  }

  const currentSession = await this.validateSession(oldRefreshToken);

  // Revoke the old session
  currentSession.isRevoked = true;
  await currentSession.save();

  // Create new session within the same family
  const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + expiresInMs);

  return this.create({
    userId: currentSession.userId,
    refreshTokenHash: newRefreshTokenHash,
    family: currentSession.family,
    userAgent: userAgent || currentSession.userAgent,
    ipAddress: ipAddress || currentSession.ipAddress,
    isRevoked: false,
    expiresAt,
  });
};

/**
 * Explicitly revokes a session by its refresh token.
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
sessionSchema.statics.revokeSession = async function revokeSession(refreshToken) {
  if (!refreshToken) return;
  const refreshTokenHash = hashRefreshToken(refreshToken);
  await this.updateOne({ refreshTokenHash }, { $set: { isRevoked: true } });
};

/**
 * Revokes all sessions belonging to a specific user (e.g. on password change or account compromise).
 * @param {mongoose.Types.ObjectId|string} userId
 * @returns {Promise<void>}
 */
sessionSchema.statics.revokeAllUserSessions = async function revokeAllUserSessions(userId) {
  await this.updateMany({ userId }, { $set: { isRevoked: true } });
};

export const Session = mongoose.model('Session', sessionSchema);
export default Session;
