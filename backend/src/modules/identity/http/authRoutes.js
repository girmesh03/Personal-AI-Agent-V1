/**
 * @module modules/identity/http/authRoutes
 * @description Express routing definitions for authentication endpoints (register, login, refresh, logout, SSO).
 */

import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  initiateGoogleSso,
  handleGoogleSsoCallback,
  connectGoogleDrive,
  handleGoogleCallback,
  disconnectGoogleDriveRoute,
  getGoogleDriveStatus,
  toggleGoogleDriveRoute,
} from './authController.js';
import {
  registerBodySchema,
  loginBodySchema,
} from './authSchemas.js';
import { validate } from '../../../infrastructure/http/middleware/validate.js';
import { requireUser } from '../../../infrastructure/http/middleware/requireUser.js';
import { authRateLimiter } from '../../../infrastructure/http/middleware/rateLimiter.js';

const router = express.Router();

// Apply auth rate limiting to all auth endpoints
router.use(authRateLimiter);

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user account.
 * @access Public
 */
router.post('/register', validate({ body: registerBodySchema }), register);

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user credentials and issue session tokens.
 * @access Public
 */
router.post('/login', validate({ body: loginBodySchema }), login);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh short-lived access token using long-lived refresh token.
 * @access Public (Requires valid refresh token cookie or body)
 */
router.post('/refresh', refreshToken);

/**
 * @route POST /api/v1/auth/logout
 * @desc Invalidate session and clear authentication cookies.
 * @access Public
 */
router.post('/logout', logout);

/**
 * @route GET /api/v1/auth/me
 * @desc Retrieve current authenticated user profile.
 * @access Protected
 */
router.get('/me', requireUser, getMe);

/**
 * @route GET /api/v1/auth/google/sso
 * @desc Initiate Google Single Sign-On (SSO) flow.
 * @access Public
 */
router.get('/google/sso', initiateGoogleSso);

/**
 * @route GET /api/v1/auth/google
 * @desc Alias to initiate Google SSO flow.
 * @access Public
 */
router.get('/google', initiateGoogleSso);

/**
 * @route GET /api/v1/auth/google/sso/callback
 * @desc Google Single Sign-On (SSO) OAuth callback.
 * @access Public
 */
router.get('/google/sso/callback', handleGoogleSsoCallback);

/**
 * @route GET /api/v1/auth/google/callback
 * @desc Unified Google OAuth redirect callback.
 * @access Public
 */
router.get('/google/callback', handleGoogleCallback);

/**
 * @route GET /api/v1/auth/google/connect
 * @desc Initiate Google OAuth connection for integrations.
 * @access Protected
 */
router.get('/google/connect', connectGoogleDrive);

/**
 * @route POST /api/v1/auth/google/disconnect
 * @desc Disconnect Google Drive integration.
 * @access Protected
 */
router.post('/google/disconnect', disconnectGoogleDriveRoute);

/**
 * @route GET /api/v1/auth/google/status
 * @desc Check Google Drive integration connection status.
 * @access Protected
 */
router.get('/google/status', getGoogleDriveStatus);

/**
 * @route POST /api/v1/auth/google/toggle
 * @desc Enable or disable Google Drive integration without disconnecting.
 * @access Protected
 */
router.post('/google/toggle', toggleGoogleDriveRoute);

export default router;
