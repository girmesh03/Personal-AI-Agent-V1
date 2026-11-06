/**
 * @module infrastructure/http/middleware/rateLimiter
 * @description Centralized rate limiting middleware enforcing request volume controls.
 * Implements route-level rate limits for authentication and general API protection.
 */

import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../../../utils/constants.js';
import { env } from '../../../config/env.js';

const isTest = env.NODE_ENV === 'test';

/**
 * Custom error handler for rate limit exceeded responses.
 */
const rateLimitHandler = (message = 'Too many requests. Please try again later.') => {
  return (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message,
      errorCode: 'TOO_MANY_REQUESTS',
      data: null,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message,
      },
    });
  };
};

/**
 * Strict rate limiter for authentication routes (login, register, refresh, password).
 * Mitigates brute-force credential stuffing and password guessing.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 30, // 30 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many authentication attempts from this IP. Please try again after 15 minutes.'),
  skipSuccessfulRequests: false,
});

/**
 * General rate limiter for standard API endpoints.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 5000 : 300, // 300 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many API requests from this IP. Please try again after 15 minutes.'),
});

export default {
  authRateLimiter,
  apiRateLimiter,
};
