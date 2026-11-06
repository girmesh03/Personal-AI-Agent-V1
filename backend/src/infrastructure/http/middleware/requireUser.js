/**
 * @module infrastructure/http/middleware/requireUser
 * @description Authentication middleware resolving authenticated server-derived identity.
 * Invariant: Derives user identity strictly from verified token/session, never trusting client-supplied IDs.
 */

import { verifyAccessToken } from '../../security/tokenService.js';
import { User } from '../../../modules/identity/domain/User.js';
import { UnauthenticatedError } from '../../../shared/errors/AppError.js';

/**
 * Protects downstream routes by enforcing a valid JWT access token from cookie or Authorization header.
 * Attaches the resolved User document and trusted auth context to req.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export const requireUser = async (req, _res, next) => {
  let token;

  // 1. Check HttpOnly cookies first
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  // 2. Fallback to Authorization header Bearer token
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new UnauthenticatedError('Please log in to continue.', 'UNAUTHENTICATED');
  }

  // verifyAccessToken throws UnauthenticatedError on expired or invalid token
  const decoded = verifyAccessToken(token);

  const user = await User.findById(decoded.id).select(
    '-password +settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey +integrations.telegram.botToken'
  );

  if (!user) {
    throw new UnauthenticatedError('Account not found. Please log in again.', 'UNAUTHENTICATED');
  }

  // Attach server-derived trusted identity
  req.user = user;
  req.userId = String(user._id);
  req.auth = Object.freeze({
    userId: String(user._id),
    email: user.email,
  });

  next();
};

/**
 * Optional user resolution middleware.
 * Attaches user if valid credentials are present, but does not block requests if unauthenticated.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export const optionalUser = async (req, _res, next) => {
  let token;

  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    req.userId = null;
    req.auth = null;
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select(
      '-password +settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey +integrations.telegram.botToken'
    );
    if (user) {
      req.user = user;
      req.userId = String(user._id);
      req.auth = Object.freeze({
        userId: String(user._id),
        email: user.email,
      });
    } else {
      req.user = null;
      req.userId = null;
      req.auth = null;
    }
  } catch {
    req.user = null;
    req.userId = null;
    req.auth = null;
  }

  next();
};

// Aliases for compatibility
export const protect = requireUser;
export const verifyToken = requireUser;

export default requireUser;
