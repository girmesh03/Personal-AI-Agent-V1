/**
 * @module infrastructure/http/middleware/csrfProtection
 * @description Robust CSRF mitigation for cookie-authenticated state-changing requests.
 * Uses strict Origin/Referer validation combined with double-submit CSRF token (X-CSRF-Token).
 */

import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { ForbiddenError } from '../../../shared/errors/AppError.js';
import logger from '../../../config/logger.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PATHS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/google',
  '/api/v1/auth/google/callback',
  '/api/v1/auth/google/sso',
  '/api/v1/auth/google/sso/callback',
  '/health',
  '/api/health',
  '/api/v1/health',
]);

/**
 * Generates a random cryptographic CSRF token.
 * @returns {string}
 */
export const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Resolves allowed origin hostnames based on configuration.
 * @returns {string[]}
 */
const getAllowedOrigins = () => {
  const configured = env.CLIENT_ORIGIN
    ? env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  return [
    ...configured,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
  ];
};

/**
 * Middleware enforcing CSRF mitigation on state-changing requests.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const csrfProtection = (req, res, next) => {
  // 1. Safe HTTP methods (GET, HEAD, OPTIONS) do not alter server state
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 2. Exempt public onboarding endpoints and health checks
  const normalizedPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
  if (EXEMPT_PATHS.has(normalizedPath) || EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // 3. Authorization Header Exemption:
  // Explicit Bearer tokens are not automatically attached cross-origin by browsers.
  // CSRF attacks exploit ambient credentials (cookies), not explicit Authorization headers.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }

  // If request has no authentication cookies, it cannot be an authenticated CSRF exploit
  const hasAuthCookies = Boolean(req.cookies?.accessToken || req.cookies?.token || req.cookies?.refreshToken);
  if (!hasAuthCookies) {
    return next();
  }

  // 4. Strict Origin and Referer validation for cookie-authenticated state-changing requests
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedOrigins = getAllowedOrigins();

  if (origin) {
    const isAllowedOrigin =
      allowedOrigins.includes(origin) ||
      (env.NODE_ENV === 'production' && /\.vercel\.app$/.test(new URL(origin).hostname));

    if (!isAllowedOrigin) {
      logger.warn(`[csrfProtection] Origin mismatch rejected: ${origin}`);
      throw new ForbiddenError(
        'Cross-origin state-changing request rejected by CSRF protection.',
        'CSRF_ORIGIN_MISMATCH'
      );
    }
  } else if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      const isAllowedReferer =
        allowedOrigins.includes(refererOrigin) ||
        (env.NODE_ENV === 'production' && /\.vercel\.app$/.test(new URL(refererOrigin).hostname));

      if (!isAllowedReferer) {
        logger.warn(`[csrfProtection] Referer mismatch rejected: ${refererOrigin}`);
        throw new ForbiddenError(
          'Cross-origin state-changing request rejected by CSRF protection.',
          'CSRF_REFERER_MISMATCH'
        );
      }
    } catch {
      throw new ForbiddenError('Invalid referer header format.', 'CSRF_INVALID_REFERER');
    }
  }

  // 5. CSRF Token Validation (Double Submit Cookie / Custom Header)
  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  const cookieToken = req.cookies?.csrfToken || req.cookies?.['XSRF-TOKEN'];

  if (cookieToken) {
    if (!headerToken || headerToken !== cookieToken) {
      logger.warn('[csrfProtection] CSRF token mismatch or missing header token.');
      throw new ForbiddenError(
        'Invalid or missing CSRF token in X-CSRF-Token header.',
        'CSRF_TOKEN_MISMATCH'
      );
    }
  }

  next();
};

/**
 * Attaches a CSRF token cookie to response for client SPA consumption.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const setCsrfCookie = (req, res) => {
  let token = req.cookies?.csrfToken;
  if (!token) {
    token = generateCsrfToken();
    res.cookie('csrfToken', token, {
      httpOnly: false, // Must be readable by client JavaScript to place into X-CSRF-Token header
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
  }
  return token;
};

export default csrfProtection;
