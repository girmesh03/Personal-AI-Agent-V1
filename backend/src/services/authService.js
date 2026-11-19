/**
 * @module services/authService
 * @description Authentication domain service implementing registration, credential verification,
 * dual-token session management, and Google SSO.
 * Strictly adheres to Protocol 17 (silent refresh), Protocol 21 (user isolation),
 * Protocol 32 (minimal registration), and Protocol 38 (deterministic name derivation).
 */

import User from '../models/User.js';
import { deriveNamesFromEmail } from '../utils/authUtils.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { ConflictError, UnauthenticatedError } from '../errors/CustomError.js';
import { env } from '../config/env.js';

/**
 * Registers a new user account with minimal payload and deterministic name derivation.
 *
 * @function registerUser
 * @param {{ email: string, password: string }} credentials - Account registration payload.
 * @returns {Promise<{ user: object }>} Sanitized user record.
 * @throws {ConflictError} If an account with the specified email already exists.
 */
export const registerUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check for existing account
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ConflictError('An account with this email address already exists.', 'CONFLICT');
  }

  // 2. Deterministically derive identity names from email local part (Protocol 38)
  const { firstName, lastName } = deriveNamesFromEmail(normalizedEmail);

  // 3. Create user record
  const user = await User.create({
    email: normalizedEmail,
    password,
    firstName,
    lastName,
    position: '',
    authProvider: 'local',
    isPasswordSet: true,
  });

  return { user: user.toJSON() };
};

/**
 * Authenticates user credentials and issues dual access and refresh tokens.
 *
 * @function authenticateUser
 * @param {{ email: string, password: string }} credentials - Login credentials.
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>} User and signed tokens.
 * @throws {UnauthenticatedError} If credentials are invalid or password is not set.
 */
export const authenticateUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Query user with password hash explicitly selected
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    throw new UnauthenticatedError('Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  // 2. Check if password is set on this account (e.g. Google SSO accounts without local password)
  if (!user.isPasswordSet || !user.password) {
    throw new UnauthenticatedError(
      'This account was created with Google Sign-In. Please sign in with Google or reset your password.',
      'INVALID_CREDENTIALS'
    );
  }

  // 3. Verify password hash
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new UnauthenticatedError('Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  // 4. Issue dual tokens (Protocol 17)
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
};

/**
 * Refreshes an expired user session by verifying the refresh token and issuing a rotated token pair.
 *
 * @function refreshSession
 * @param {string} refreshToken - Raw signed JWT refresh token.
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>} User and rotated tokens.
 * @throws {UnauthenticatedError} If the token is missing, expired, or invalid.
 */
export const refreshSession = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthenticatedError('Refresh token is required to renew session.', 'UNAUTHENTICATED');
  }

  // 1. Cryptographically verify refresh token signature and expiration
  const decoded = verifyRefreshToken(refreshToken);

  // 2. Locate active user account
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new UnauthenticatedError('User account associated with this session no longer exists.', 'UNAUTHENTICATED');
  }

  // 3. Rotate tokens: generate fresh access token and fresh refresh token (Protocol 17)
  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  return {
    user: user.toJSON(),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Handles Google OAuth single sign-on authorization code callback.
 *
 * @function handleGoogleSsoCallback
 * @param {string} code - Google OAuth authorization code.
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>} User and tokens.
 */
export const handleGoogleSsoCallback = async (code) => {
  if (!code) {
    throw new UnauthenticatedError('Authorization code is required for Google SSO.', 'UNAUTHENTICATED');
  }

  // In test or development without active external Google credentials, support simulated code
  let email = '';
  let googleId = '';

  if (env.NODE_ENV !== 'production' && code.startsWith('mock_code_')) {
    const rawSubject = code.replace('mock_code_', '');
    email = rawSubject.includes('@')
      ? rawSubject.toLowerCase().trim()
      : `${rawSubject}@operon-test.local`.toLowerCase();
    googleId = `mock_google_id_${Date.now()}`;
  } else {
    // Standard OAuth token exchange via Google token endpoint
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_SSO_CLIENT_ID,
        client_secret: env.GOOGLE_SSO_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_SSO_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new UnauthenticatedError('Failed to exchange authorization code with Google.', 'UNAUTHENTICATED');
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await userInfoResponse.json();
    if (!userInfoResponse.ok || !googleUser.email) {
      throw new UnauthenticatedError('Failed to retrieve user profile from Google.', 'UNAUTHENTICATED');
    }

    email = googleUser.email.toLowerCase().trim();
    googleId = googleUser.id;
  }

  // Find or create user by googleId or email
  let user = googleId ? await User.findOne({ googleId }) : null;
  if (!user) {
    user = await User.findOne({ email });
  }

  if (user) {
    if (googleId && !user.googleId) {
      user.googleId = googleId;
    }
    if (user.authProvider === 'local') {
      user.authProvider = 'both';
    }
    await user.save();
  } else {
    const { firstName, lastName } = deriveNamesFromEmail(email);
    user = await User.create({
      email,
      googleId: googleId || null,
      firstName,
      lastName,
      authProvider: 'google',
      isPasswordSet: false,
    });
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
};

export default {
  registerUser,
  authenticateUser,
  refreshSession,
  handleGoogleSsoCallback,
};
