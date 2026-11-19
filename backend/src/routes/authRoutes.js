/**
 * @module routes/authRoutes
 * @description Authentication route definitions and schema validation bindings.
 * Strictly adheres to Protocol 17 (silent refresh / secure cookies), Protocol 32 (minimal registration payload),
 * Protocol 34 (canonical identity hierarchy), Protocol 35 (single canonical handler identifiers),
 * Protocol 39 (strict validation hygiene), Protocol 40 (mandatory pre-handler validation),
 * Protocol 60 (strict validated data access via req.validated), Protocol 61 (zero token exposure in response payloads),
 * and Protocol 71 (universal JSDoc consistency and strong type contracts).
 */

import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  googleSsoCallbackSchema,
} from '../validations/authValidation.js';
import {
  register,
  login,
  refreshToken,
  logout,
  initiateGoogleSso,
  handleGoogleSsoCallback,
} from '../controllers/authController.js';

/**
 * Express router instance for authentication domain endpoints.
 * @type {import('express').Router}
 */
const router = Router();

/**
 * Registers a new user account with minimal credentials.
 * @route POST /api/v1/auth/register
 * @access Public
 * @middleware validate(registerSchema)
 * @controller register
 * @governs Protocol 18, 32, 38, 39, 40, 60, 61
 */
router.post('/register', validate(registerSchema), register);

/**
 * Authenticates user credentials and establishes a session via secure HttpOnly cookies.
 * @route POST /api/v1/auth/login
 * @access Public
 * @middleware validate(loginSchema)
 * @controller login
 * @governs Protocol 17, 18, 39, 40, 60, 61
 */
router.post('/login', validate(loginSchema), login);

/**
 * Renews an active session by rotating access and refresh tokens.
 * @route POST /api/v1/auth/refresh
 * @access Public (Requires valid refresh token cookie)
 * @middleware validate(refreshTokenSchema)
 * @controller refreshToken
 * @governs Protocol 17, 40, 60, 61
 */
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

/**
 * Terminates user session and irreversibly purges authentication cookies.
 * @route POST /api/v1/auth/logout
 * @access Public
 * @controller logout
 * @governs Protocol 17, 42
 */
router.post('/logout', logout);

/**
 * Initiates Google OAuth Single Sign-On flow with CSRF state protection.
 * @route GET /api/v1/auth/google/sso
 * @access Public
 * @controller initiateGoogleSso
 * @governs Protocol 34
 */
router.get('/google/sso', initiateGoogleSso);

/**
 * Handles Google OAuth callback, verifies CSRF state, and establishes user session.
 * @route GET /api/v1/auth/google/sso/callback
 * @access Public
 * @middleware validate(googleSsoCallbackSchema, 'query')
 * @controller handleGoogleSsoCallback
 * @governs Protocol 34, 40, 60, 61
 */
router.get('/google/sso/callback', validate(googleSsoCallbackSchema, 'query'), handleGoogleSsoCallback);

export default router;
