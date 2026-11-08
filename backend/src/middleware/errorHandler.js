/**
 * @module middleware/errorHandler
 * @description Centralized Express global error handling middleware normalizing all application exceptions.
 */

import { logger } from '../config/logger.js';
import { formatError } from '../utils/errorFormatter.js';

/**
 * Global Express 4-argument error-handling middleware.
 * Intercepts operational errors, Mongoose/MongoDB errors, JWT errors, and unhandled exceptions,
 * formatting them safely into a uniform JSON response envelope.
 *
 * @param {Error} err - Error object thrown or forwarded by route handlers.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} _next - Express next middleware function (required for 4-arg signature).
 * @returns {import('express').Response} Structured JSON error response.
 */
export const errorHandler = (err, req, res, _next) => {
  const { statusCode, payload, error } = formatError(err, req);

  // Log error based on severity level
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} - ${statusCode} ${error.code}: ${error.message}`, {
      correlationId: error.correlationId,
      stack: err?.stack,
    });
  } else {
    logger.warn(`[${req.method}] ${req.originalUrl} - ${statusCode} ${error.code}: ${error.message}`, {
      correlationId: error.correlationId,
    });
  }

  return res.status(statusCode).json(payload);
};

export default errorHandler;
