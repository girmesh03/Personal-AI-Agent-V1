/**
 * @module modules/identity/services/authService
 * @description Core authentication service managing registration, login, token refresh rotation,
 * session revocation, profile retrieval, and Google SSO account linking.
 */

import crypto from 'node:crypto';
import { User } from '../domain/User.js';
import { Session } from '../domain/Session.js';
import { AuthIdentity } from '../domain/AuthIdentity.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../../infrastructure/security/tokenService.js';
import {
  ConflictError,
  UnauthenticatedError,
  NotFoundError,
} from '../../../shared/errors/AppError.js';
import { deriveNamesFromEmail } from '../utils/nameDerivation.js';
import { DEFAULT_POSITION } from '../../../utils/constants.js';
import logger from '../../../config/logger.js';

/**
 * Registers a new user account.
 *
 * @param {{ email: string, password: string, firstName?: string, lastName?: string, position?: string, avatar?: string | null }} data
 * @returns {Promise<{ user: object }>}
 */
export const registerUser = async ({ email, password, firstName, lastName, position, avatar }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if a user with this email already exists
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    if (existingUser.authProvider === 'google' && !existingUser.isPasswordSet) {
      throw new ConflictError(
        'This email is already registered via Google Sign-In. Please sign in with Google or sign in to set a password in your Profile.'
      );
    }
    throw new ConflictError('A user with this email address already exists. Please sign in instead.');
  }

  // Derive human names from email if omitted
  const derived = deriveNamesFromEmail(normalizedEmail);
  const resolvedFirstName = (firstName && firstName.trim()) || derived.firstName;
  const resolvedLastName = (lastName && lastName.trim()) || derived.lastName;

  const user = await User.create({
    email: normalizedEmail,
    password,
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    position: position || DEFAULT_POSITION,
    avatar: avatar || null,
    authProvider: 'local',
    isPasswordSet: true,
  });

  logger.info(`[authService] User registered successfully: ${normalizedEmail} (id: ${user._id})`);

  return {
    user: user.toJSON(),
  };
};

/**
 * Authenticates user credentials and creates a new session family.
 *
 * @param {{ email: string, password: string, userAgent?: string, ipAddress?: string }} data
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string, requiresSso?: boolean }>}
 */
export const loginUser = async ({ email, password, userAgent, ipAddress }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Query user with password selected
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    throw new UnauthenticatedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Account registered via SSO without password
  if (user.isPasswordSet === false && user.authProvider === 'google') {
    return {
      requiresSso: true,
      authProvider: 'google',
      message:
        "This account was registered using Google Sign-In and does not have an email password yet. Please click 'Continue with Google' to sign in, or set a password in your Profile.",
      user: null,
      accessToken: null,
      refreshToken: null,
    };
  }

  // Verify password hash
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthenticatedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Issue tokens
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Create persistent session in DB with new family UUID
  await Session.createSession({
    userId: user._id,
    refreshToken,
    userAgent,
    ipAddress,
  });

  logger.info(`[authService] User logged in: ${normalizedEmail} (id: ${user._id})`);

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
};

/**
 * Rotates the refresh token and issues a fresh access token.
 * Triggers breach detection if token reuse is detected.
 *
 * @param {{ rawRefreshToken: string, userAgent?: string, ipAddress?: string }} data
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 */
export const rotateUserSession = async ({ rawRefreshToken, userAgent, ipAddress }) => {
  if (!rawRefreshToken) {
    throw new UnauthenticatedError('Please log in again to continue.', 'NO_REFRESH_TOKEN');
  }

  // Verify signature and expiration
  const decoded = verifyRefreshToken(rawRefreshToken);

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new UnauthenticatedError('User account could not be found. Please log in again.', 'USER_NOT_FOUND');
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  // Rotate in session registry (breach detection handled inside Session.rotateSession)
  await Session.rotateSession({
    oldRefreshToken: rawRefreshToken,
    newRefreshToken,
    userAgent,
    ipAddress,
  });

  logger.info(`[authService] Session rotated for user: ${user.email} (id: ${user._id})`);

  return {
    user: user.toJSON(),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Revokes a session on logout.
 *
 * @param {{ rawRefreshToken?: string }} data
 * @returns {Promise<boolean>}
 */
export const logoutUser = async ({ rawRefreshToken }) => {
  if (rawRefreshToken) {
    await Session.revokeSession(rawRefreshToken);
  }
  return true;
};

/**
 * Retrieves the current user's sanitized profile.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<object>}
 */
export const getUserProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user.toJSON();
};

/**
 * Authenticates or auto-provisions a user from Google SSO.
 *
 * @param {{ profile: { sub: string, email: string, name?: string, given_name?: string, family_name?: string, picture?: string }, userAgent?: string, ipAddress?: string }} options
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 */
export const authenticateWithGoogleSso = async ({ profile, userAgent, ipAddress }) => {
  const email = profile.email.toLowerCase().trim();

  let user = await User.findOne({ email });

  if (!user) {
    const fallbackNames = deriveNamesFromEmail(email);
    const givenName = profile.given_name || (profile.name ? profile.name.split(' ')[0] : fallbackNames.firstName);
    const familyName =
      profile.family_name ||
      (profile.name && profile.name.split(' ').length > 1
        ? profile.name.split(' ').slice(1).join(' ')
        : fallbackNames.lastName);
    const randomPassword = crypto.randomBytes(32).toString('hex') + 'A1!';

    user = await User.create({
      email,
      firstName: givenName,
      lastName: familyName || fallbackNames.lastName,
      avatar: profile.picture || null,
      password: randomPassword,
      position: DEFAULT_POSITION,
      authProvider: 'google',
      isPasswordSet: false,
    });

    logger.info(`[authService] New user auto-provisioned via Google SSO: ${email}`);
  } else {
    if (user.authProvider === 'local') {
      user.authProvider = 'both';
    }
    if (!user.avatar && profile.picture) {
      user.avatar = profile.picture;
    }
    await user.save();
  }

  // Link AuthIdentity
  await AuthIdentity.findOneAndUpdate(
    { provider: 'google', providerId: profile.sub },
    {
      userId: user._id,
      provider: 'google',
      providerId: profile.sub,
      email,
      profileData: {
        name: profile.name,
        picture: profile.picture,
      },
    },
    { upsert: true, new: true }
  );

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  await Session.createSession({
    userId: user._id,
    refreshToken,
    userAgent,
    ipAddress,
  });

  logger.info(`[authService] Google SSO authentication successful for: ${email}`);

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
};
