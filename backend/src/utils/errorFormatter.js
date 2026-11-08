/**
 * @module utils/errorFormatter
 * @description Universal Error Formatter normalizing operational AppError, database, validation, JWT, and runtime exceptions.
 */

import crypto from 'crypto';
import { HTTP_STATUS, ENVIRONMENTS } from './constants.js';
import { AppError } from '../errors/AppError.js';

/**
 * Normalizes any error across the application into a consistent, sanitized error structure.
 *
 * @param {unknown} err - The captured error or exception.
 * @param {object} [req] - Express request object for correlation ID extraction.
 * @returns {{ statusCode: number, success: boolean, error: object, payload: object }} Normalized error object.
 */
export function formatError(err, req = {}) {
  const nodeEnv = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  const isDevelopment = nodeEnv === ENVIRONMENTS.DEVELOPMENT;

  // Extract or generate correlation ID
  const correlationId =
    req?.id ||
    req?.correlationId ||
    req?.headers?.['x-correlation-id'] ||
    req?.headers?.['x-request-id'] ||
    crypto.randomUUID();

  const timestamp = new Date().toISOString();

  let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred.';
  let details = [];

  // Check if error is an instance of AppError or carries operational error flags
  const isOperationalError =
    err instanceof AppError ||
    err?.name === 'AppError' ||
    (err?.isOperational === true && typeof err?.statusCode === 'number');

  if (isOperationalError) {
    statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    code = err.code || (err.name && err.name !== 'Error' ? err.name : 'APP_ERROR');
    message = err.message;
    details = Array.isArray(err.details) ? err.details : (err.details ? [err.details] : []);
  } else if (err?.name === 'ValidationError' && err?.errors) {
    // Mongoose schema validation error
    statusCode = HTTP_STATUS.UNPROCESSABLE_ENTITY;
    code = 'VALIDATION_ERROR';
    message = 'Data validation failed';
    details = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
      kind: item.kind,
    }));
  } else if (err?.name === 'CastError') {
    // Mongoose invalid ObjectId / cast error
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid identifier format for field '${err.path}'`;
    details = [{ field: err.path, value: err.value }];
  } else if (err?.code === 11000 || (err?.name === 'MongoServerError' && err?.code === 11000)) {
    // MongoDB duplicate key error
    statusCode = HTTP_STATUS.CONFLICT;
    code = 'DUPLICATE_KEY_ERROR';
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'resource';
    message = `A record with this ${field} already exists.`;
    details = [{ field, value: err.keyValue ? err.keyValue[field] : undefined }];
  } else if (err?.name === 'TokenExpiredError') {
    // JWT expired
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
    details = [{ expiredAt: err.expiredAt }];
  } else if (err?.name === 'JsonWebTokenError') {
    // JWT signature or format invalid
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err?.name === 'NotBeforeError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    code = 'TOKEN_NOT_ACTIVE';
    message = 'Authentication token is not active yet';
  } else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // Express JSON parser body syntax error
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = 'INVALID_JSON_PAYLOAD';
    message = 'Malformed JSON payload in request body';
  } else if (err?.name === 'MulterError') {
    // Multer file upload errors
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = `UPLOAD_ERROR_${(err.code || 'FAILED').toUpperCase()}`;
    message = err.message || 'File upload error';
  } else if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    // Generic HTTP error with valid status code
    statusCode = err.statusCode;
    code = err.code || 'HTTP_ERROR';
    message = err.message || 'An error occurred processing the request.';
    details = Array.isArray(err.details) ? err.details : (err.details ? [err.details] : []);
  } else if (err instanceof Error) {
    // Generic JavaScript error
    statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    code = err.code || 'INTERNAL_SERVER_ERROR';
    message = isDevelopment ? err.message : 'An unexpected internal server error occurred.';
    if (err.details) {
      details = Array.isArray(err.details) ? err.details : [err.details];
    }
  }

  const errorPayload = {
    code,
    message,
    details,
    timestamp,
    correlationId,
    ...(isDevelopment && err?.stack ? { stack: err.stack } : {}),
  };

  const payload = {
    success: false,
    error: errorPayload,
  };

  return {
    statusCode,
    success: false,
    error: errorPayload,
    payload,
  };
}

// Bind format implementation into AppError prototype so any AppError instance knows errorFormatter
AppError.prototype._formatter = formatError;

export default formatError;
