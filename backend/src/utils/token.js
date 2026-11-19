/**
 * @module utils/token
 * @description Dual JWT token management engine and secure HTTP cookie utilities (Protocol 17).
 * Derives lifespans dynamically from environment configuration.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JWT_EXPIRY, COOKIE_MAX_AGE } from './constants.js';
import { UnauthenticatedError } from '../errors/CustomError.js';

/**
 * Generates a signed short-lived JWT access token for user authentication.
 *
 * @function generateAccessToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT access token.
 */
export const generateAccessToken = (userId) => {
  return jwt.sign({ id: String(userId) }, env.JWT_ACCESS_SECRET, {
    expiresIn: JWT_EXPIRY.ACCESS,
  });
};

/**
 * Generates a signed long-lived JWT refresh token.
 *
 * @function generateRefreshToken
 * @param {string|import('mongoose').Types.ObjectId} userId - Unique identifier of the authenticated user.
 * @returns {string} Signed JWT refresh token.
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: String(userId) }, env.JWT_REFRESH_SECRET, {
    expiresIn: JWT_EXPIRY.REFRESH,
  });
};

/**
 * Verifies and decodes a JWT access token.
 *
 * @function verifyAccessToken
 * @param {string} token - Raw JWT access token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthenticatedError('Session has expired. Please log in again.', 'UNAUTHENTICATED');
    }
    throw new UnauthenticatedError('Please log in again.', 'UNAUTHENTICATED');
  }
};

/**
 * Verifies and decodes a JWT refresh token.
 *
 * @function verifyRefreshToken
 * @param {string} token - Raw JWT refresh token string.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded token payload containing user id.
 * @throws {UnauthenticatedError} If token is expired, corrupted, or signature is invalid.
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
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
 *
 * @function setAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 * @returns {void}
 */
export const setAccessTokenCookie = (res, accessToken) => {
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
};

/**
 * Clears the access token cookie from the client across root and API paths.
 *
 * @function clearAccessTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
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
 *
 * @function setRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @param {string} refreshToken - Signed JWT refresh token.
 * @returns {void}
 */
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
};

/**
 * Clears the refresh token cookie defensively from the client upon logout or invalidation.
 *
 * @function clearRefreshTokenCookie
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
export const clearRefreshTokenCookie = (res) => {
  const clearOptions = { ...REFRESH_COOKIE_OPTIONS };
  delete clearOptions.maxAge;
  res.clearCookie('refreshToken', { ...clearOptions, path: '/' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1/auth' });
  res.clearCookie('refreshToken', { ...clearOptions, path: '/api/v1/auth/refresh' });
};

/**
 * Attaches both access and refresh tokens to the HTTP response as secure cookies.
 *
 * @function setAuthCookies
 * @param {import('express').Response} res - Express response object.
 * @param {string} accessToken - Signed JWT access token.
 * @param {string} refreshToken - Signed JWT refresh token.
 * @returns {void}
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
  setAccessTokenCookie,
  clearAccessTokenCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  setAuthCookies,
};
