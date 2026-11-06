/**
 * @module infrastructure/security/tokenService
 * @description Dual JWT token management engine and secure HTTP cookie utilities.
 * Enforces uniform 7-day refresh token lifespan and strict 401 UNAUTHENTICATED error handling.
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { JWT_EXPIRY, COOKIE_MAX_AGE } from '../../utils/constants.js';
import { UnauthenticatedError } from '../../shared/errors/AppError.js';

/**
 * Generates a signed short-lived JWT access token for user authentication.
 * @function generateAccessToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT access token.
 */
export const generateAccessToken = (userId) => {
  return jwt.sign(
    { id: String(userId), jti: crypto.randomUUID() },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN || JWT_EXPIRY.ACCESS,
    }
  );
};

/**
 * Generates a signed long-lived JWT refresh token with uniform 7-day lifespan.
 * Strictly zero remember-me variation. Includes RFC 7519 jti UUID to prevent collisions.
 * @function generateRefreshToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT refresh token.
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: String(userId), jti: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN || JWT_EXPIRY.REFRESH,
    }
  );
};

/**
 * Verifies and decodes a JWT access token.
 * @function verifyAccessToken
 * @param {string} token - Raw JWT access token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyAccessToken = (token) => {
  try {
    return /** @type {import('jsonwebtoken').JwtPayload} */ (jwt.verify(token, env.JWT_ACCESS_SECRET));
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TokenExpiredError') {
      throw new UnauthenticatedError('Session has expired. Please log in again.', 'UNAUTHENTICATED');
    }
    throw new UnauthenticatedError('Please log in again.', 'UNAUTHENTICATED');
  }
};

/**
 * Verifies and decodes a JWT refresh token.
 * @function verifyRefreshToken
 * @param {string} token - Raw JWT refresh token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyRefreshToken = (token) => {
  try {
    return /** @type {import('jsonwebtoken').JwtPayload} */ (jwt.verify(token, env.JWT_REFRESH_SECRET));
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TokenExpiredError') {
      throw new UnauthenticatedError('Session has expired. Please log in again.', 'UNAUTHENTICATED');
    }
    throw new UnauthenticatedError('Please log in again.', 'UNAUTHENTICATED');
  }
};

/**
 * Standard cookie configuration options for access token.
 * @constant
 * @type {Readonly<import('express').CookieOptions>}
 */
export const ACCESS_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE.ACCESS,
  path: '/',
});

/**
 * Standard cookie configuration options for refresh token.
 * @constant
 * @type {Readonly<import('express').CookieOptions>}
 */
export const REFRESH_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE.REFRESH,
  path: '/',
});

/**
 * Attaches the access token to the HTTP response as a secure, httpOnly cookie.
 * @function setAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 */
export const setAccessTokenCookie = (res, accessToken) => {
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
};

/**
 * Clears the access token cookie from the client.
 * @function clearAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 */
export const clearAccessTokenCookie = (res) => {
  const clearOptions = { ...ACCESS_COOKIE_OPTIONS };
  delete clearOptions.maxAge;
  res.clearCookie('accessToken', { ...clearOptions, path: '/' });
  res.clearCookie('accessToken', { ...clearOptions, path: '/api/v1' });
  res.clearCookie('accessToken', { ...clearOptions, path: '/api/v1/auth' });
};

/**
 * Attaches the refresh token to the HTTP response as a secure, httpOnly cookie.
 * @function setRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} refreshToken - Signed JWT refresh token.
 */
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
};

/**
 * Clears the refresh token cookie from the client.
 * @function clearRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 */
export const clearRefreshTokenCookie = (res) => {
  const clearOptions = { ...REFRESH_COOKIE_OPTIONS };
  delete clearOptions.maxAge;
  res.clearCookie('refreshToken', { ...clearOptions, path: '/' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1/auth' });
};

/**
 * Sets both access and refresh cookies simultaneously.
 * @function setAuthCookies
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 * @param {string} refreshToken - Signed JWT refresh token.
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
};

/**
 * Clears both access and refresh cookies from the client.
 * @function clearAuthCookies
 * @param {import('express').Response} res - Express response object.
 */
export const clearAuthCookies = (res) => {
  clearAccessTokenCookie(res);
  clearRefreshTokenCookie(res);
};
