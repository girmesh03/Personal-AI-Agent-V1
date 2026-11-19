/**
 * @module middleware/errorHandler
 * @description Centralized global error handling middleware normalizing all application exceptions
 * into a uniform JSON response envelope. Adheres strictly to Protocol 62 (defensive malformed payload handling).
 */

import { HTTP_STATUS } from '../utils/constants.js';
import {
  CustomError,
  ConflictError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
  PayloadTooLargeError,
} from '../errors/CustomError.js';
import { logger } from '../config/logger.js';

/**
 * Global Express 4-argument error-handling middleware.
 * Intercepts operational errors, Mongoose driver errors, and unhandled exceptions,
 * serializing them into a uniform JSON response envelope.
 *
 * @function errorHandler
 * @param {Error} err - Error object thrown or forwarded by route handlers.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} _next - Express next middleware function (required for 4-arg signature).
 * @returns {import('express').Response} Structured JSON error response.
 */
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // 0. Body-Parser / Malformed JSON SyntaxError (Protocol 62)
  if (
    err.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400))
  ) {
    error = new BadRequestError(
      'Malformed JSON payload in request body. Please verify JSON syntax.',
      'MALFORMED_JSON'
    );
  }
  // 0a. Payload Too Large (e.g. body-parser limit exceeded)
  else if (
    err.type === 'entity.too.large' ||
    err.name === 'PayloadTooLargeError' ||
    err.status === 413 ||
    err.statusCode === 413
  ) {
    error = new PayloadTooLargeError(
      'Uploaded request payload exceeds the maximum permitted limit of 10MB.',
      'PAYLOAD_TOO_LARGE'
    );
  }
  // 0b. Unsupported Media Type or Encoding
  else if (
    err.type === 'charset.unsupported' ||
    err.type === 'encoding.unsupported' ||
    err.status === 415 ||
    err.statusCode === 415
  ) {
    error = new BadRequestError(
      'Unsupported payload encoding or media type.',
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }
  // 0c. General HTTP client errors (status 400-499) emitted prior to controllers
  else if (
    (typeof err.status === 'number' && err.status >= 400 && err.status < 500) ||
    (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500)
  ) {
    const status = err.status || err.statusCode;
    error = new CustomError(
      err.message || 'Invalid client request.',
      status,
      err.errorCode || 'BAD_REQUEST'
    );
  }

  // 1. Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    error = new ConflictError(`A record with this ${field} already exists. Please provide a different value.`);
  }

  // 2. Mongoose validation error
  else if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ValidationError('Please check the entered information and correct any validation issues.', details);
  }

  // 3. Mongoose CastError (e.g. invalid ObjectId format)
  else if (err.name === 'CastError') {
    error = new BadRequestError('The provided identifier format is invalid.');
  }

  // 4. JWT Authentication errors
  else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Please log in again.';
    error = new UnauthenticatedError(message, 'UNAUTHENTICATED');
  }

  // 5. Multer file upload errors
  else if (err.name === 'MulterError') {
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

  // Handle known operational CustomError subclasses
  if (error instanceof CustomError) {
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
    });
  }

  // Unhandled unexpected internal server errors (500)
  logger.error(`[UNHANDLED_EXCEPTION] [${req.method}] ${req.originalUrl} - ${err.message}\n${err.stack}`);

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'An unexpected internal error occurred. Please try again later.',
    data: null,
    errorCode: 'INTERNAL_SERVER_ERROR',
    details: null,
  });
};

export default errorHandler;
