/**
 * @module infrastructure/http/middleware/errorHandler
 * @description Centralized global error handling middleware normalizing all application exceptions.
 */

import { HTTP_STATUS } from '../../../utils/constants.js';
import {
  AppError,
  ConflictError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
} from '../../../shared/errors/AppError.js';
import { logger } from '../../../config/logger.js';
import { formatUserFriendlyError } from '../../../utils/errorFormatter.js';

/**
 * Global Express error-handling middleware.
 * Intercepts operational errors, Mongoose/Zod validation failures, and unhandled exceptions,
 * returning a unified JSON envelope.
 *
 * @function errorHandler
 * @param {Error} err - Error object.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} _next - Express next function.
 * @returns {import('express').Response}
 */
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // 1. Mongoose duplicate key error (code 11000)
  if (err?.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    error = new ConflictError(`A record with this ${field} already exists. Please provide a different value.`);
  }

  // 2. Mongoose validation error
  else if (err?.name === 'ValidationError' && err?.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ValidationError('Please check the entered information and correct any validation issues.', details);
  }

  // 3. Mongoose CastError (e.g. invalid ObjectId format)
  else if (err?.name === 'CastError') {
    error = new BadRequestError('The provided identifier format is invalid.');
  }

  // 4. Zod schema validation error
  else if (err?.name === 'ZodError' && Array.isArray(err?.issues)) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    error = new ValidationError('Validation failed for the submitted data.', details);
  }

  // 5. JWT Authentication errors
  else if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Your session has expired. Please log in again.'
        : 'Invalid authentication credentials. Please log in again.';
    error = new UnauthenticatedError(message, 'UNAUTHENTICATED');
  }

  // 6. Multer file upload errors
  else if (err?.name === 'MulterError') {
    let message = 'File upload failed. Please verify your file requirements.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed file size.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded in a single request.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected upload field "${err.field}".`;
    }
    error = new BadRequestError(message, 'UPLOAD_LIMIT_EXCEEDED');
  }

  // Handle known operational AppError subclasses
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(`[${req.method}] ${req.originalUrl} - ${error.statusCode} ${error.errorCode}: ${error.message}\n${error.stack}`);
    } else {
      logger.warn(`[${req.method}] ${req.originalUrl} - ${error.statusCode} ${error.errorCode}: ${error.message}`);
    }

    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      data: null,
      errorCode: error.errorCode,
      details: error.details,
      error: {
        code: error.errorCode,
        message: error.message,
        details: error.details,
      },
    });
  }

  // Unhandled unexpected internal server error
  logger.error(`[UNHANDLED_EXCEPTION] [${req.method}] ${req.originalUrl} - ${err?.message}\n${err?.stack}`);

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: formatUserFriendlyError(err),
    data: null,
    errorCode: 'INTERNAL_SERVER_ERROR',
    details: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: formatUserFriendlyError(err),
      details: null,
    },
  });
};

export default errorHandler;
