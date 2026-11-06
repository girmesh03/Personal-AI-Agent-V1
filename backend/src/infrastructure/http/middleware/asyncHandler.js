/**
 * @module infrastructure/http/middleware/asyncHandler
 * @description Higher-order middleware wrapper ensuring unhandled async exceptions are routed to Express error handling.
 */

/**
 * Wraps an async route handler or middleware to catch any rejected promises and forward them to next().
 *
 * @param {Function} fn - Async Express request handler
 * @returns {import('express').RequestHandler}
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
