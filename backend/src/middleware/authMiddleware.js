/**
 * @module middleware/authMiddleware
 * @description Authentication middleware verifying JWT Bearer access tokens and attaching the authenticated user to the request.
 * Enforces single-user operational security (Protocol 21) with a single canonical export (Protocol 35).
 */

import asyncHandler from 'express-async-handler';
import { verifyAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { UnauthenticatedError } from '../errors/CustomError.js';

/**
 * Protects downstream routes by verifying incoming JWT Bearer tokens from HttpOnly cookies or the Authorization header.
 * Attaches the resolved User document (excluding password) to req.user.
 *
 * @function protect
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 * @throws {UnauthenticatedError} If token is missing, malformed, expired, invalid, or user no longer exists.
 */
export const protect = asyncHandler(async (req, _res, next) => {
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

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    throw new UnauthenticatedError('Account not found. Please log in again.', 'UNAUTHENTICATED');
  }

  req.user = user;
  next();
});

export default protect;
