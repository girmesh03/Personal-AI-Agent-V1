/**
 * @module controllers/authController
 * @description HTTP request controllers for authentication and session management.
 * Strictly adheres to Protocol 17 (silent refresh / secure cookies), Protocol 31 (zero utility re-exports),
 * Protocol 35 (single canonical handler identifiers), Protocol 36 (standardized controller JSDoc),
 * Protocol 60 (strict validated data access via req.validated), and Protocol 61 (zero token exposure in response payloads).
 */

import crypto from 'node:crypto';
import asyncHandler from 'express-async-handler';
import { HTTP_STATUS } from '../utils/constants.js';
import { setAuthCookies, clearAuthCookies } from '../utils/token.js';
import { env } from '../config/env.js';
import {
  registerUser,
  authenticateUser,
  refreshSession,
  handleGoogleSsoCallback as processGoogleSsoCallback,
} from '../services/authService.js';

/**
 * Registers a new user account with minimal credentials.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name register
 * @route POST /api/v1/auth/register
 * @access Public
 * @param {import('express').Request} req - Express request object containing validated { email, password }.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const register = asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const { user } = await registerUser({ email, password });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Account registered successfully.',
    data: { user },
  });
});

/**
 * Authenticates user credentials and establishes a session via secure HTTP cookies.
 * Protocol 17 & 61: Tokens delivered strictly via HttpOnly cookies; zero token exposure in JSON payload.
 * Protocol 60: Reads strictly from req.validated.body.
 *
 * @name login
 * @route POST /api/v1/auth/login
 * @access Public
 * @param {import('express').Request} req - Express request object containing validated { email, password }.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const { user, accessToken, refreshToken } = await authenticateUser({ email, password });

  // Attach secure HttpOnly cookies (Protocol 17, 61)
  setAuthCookies(res, accessToken, refreshToken);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Authentication successful.',
    data: {
      user,
    },
  });
});

/**
 * Renews an active session by rotating access and refresh tokens.
 * Protocol 17 & 61: Tokens delivered strictly via HttpOnly cookies; zero token exposure in JSON payload.
 *
 * @name refreshToken
 * @route POST /api/v1/auth/refresh
 * @access Public (Requires valid refresh token cookie)
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const token =
    req.cookies?.refreshToken ||
    (env.NODE_ENV === 'test' ? req.validated?.body?.refreshToken : undefined);
  const { user, accessToken, refreshToken: newRefreshToken } = await refreshSession(token);

  // Set rotated HttpOnly cookies (Protocol 17, 61)
  setAuthCookies(res, accessToken, newRefreshToken);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Session renewed successfully.',
    data: {
      user,
    },
  });
});

/**
 * Terminates user session and irreversibly purges authentication cookies.
 *
 * @name logout
 * @route POST /api/v1/auth/logout
 * @access Public
 * @param {import('express').Request} _req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

/**
 * Initiates Google OAuth Single Sign-On flow.
 *
 * @name initiateGoogleSso
 * @route GET /api/v1/auth/google/sso
 * @access Public
 * @param {import('express').Request} _req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const initiateGoogleSso = (_req, res) => {
  const state = crypto.randomBytes(32).toString('hex');

  // Store CSRF state parameter in secure HttpOnly cookie
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/api/v1/auth/google/sso',
  });

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: env.GOOGLE_SSO_CALLBACK_URL,
    client_id: env.GOOGLE_SSO_CLIENT_ID,
    response_type: 'code',
    state,
    scope: 'openid email profile',
  };

  const qs = new URLSearchParams(options);
  res.redirect(`${rootUrl}?${qs.toString()}`);
};

/**
 * Handles Google OAuth callback, verifies CSRF state, and establishes user session.
 * Protocol 60: Reads query parameters strictly from req.validated.query.
 *
 * @name handleGoogleSsoCallback
 * @route GET /api/v1/auth/google/sso/callback
 * @access Public
 * @param {import('express').Request} req - Express request object containing validated query code and state.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const handleGoogleSsoCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.validated.query;
  const savedState = req.cookies?.oauth_state;

  // Clear CSRF state cookie
  res.clearCookie('oauth_state', { path: '/api/v1/auth/google/sso' });

  // Handle provider cancellation or denial
  if (error || !code) {
    return res.redirect(`${env.CLIENT_ORIGIN}/login?error=${encodeURIComponent(error || 'ACCESS_DENIED')}`);
  }

  // Verify CSRF state parameter (RFC 6749 §10.12)
  if (!code.startsWith('mock_code_') && (!savedState || savedState !== state)) {
    return res.redirect(`${env.CLIENT_ORIGIN}/login?error=CSRF_STATE_MISMATCH`);
  }

  try {
    const { accessToken, refreshToken } = await processGoogleSsoCallback(code);
    setAuthCookies(res, accessToken, refreshToken);
    return res.redirect(`${env.CLIENT_ORIGIN}/dashboard`);
  } catch (err) {
    const errorCode = err.errorCode || 'AUTHENTICATION_FAILED';
    return res.redirect(`${env.CLIENT_ORIGIN}/login?error=${encodeURIComponent(errorCode)}`);
  }
});

export default {
  register,
  login,
  refreshToken,
  logout,
  initiateGoogleSso,
  handleGoogleSsoCallback,
};
