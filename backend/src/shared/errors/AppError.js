/**
 * @module shared/errors/AppError
 * @description Centralized application error hierarchy with operational semantics and machine-readable error codes.
 */

import { HTTP_STATUS } from '../../utils/constants.js';

/**
 * Base operational error class for all anticipated application exceptions.
 * @class AppError
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @constructor
   * @param {string} message - Human-readable error message.
   * @param {number} [statusCode=500] - Standard HTTP status code.
   * @param {string} [errorCode='INTERNAL_SERVER_ERROR'] - Machine-readable error code.
   * @param {Array<Object>|Object|null} [details=null] - Optional detailed validation or context errors.
   */
  constructor(
    message = 'An unexpected internal error occurred.',
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errorCode = 'INTERNAL_SERVER_ERROR',
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Historical alias for AppError.
 */
export const CustomError = AppError;

/**
 * 400 Bad Request Error.
 * Thrown when client sends invalid syntax or malformed request parameters.
 */
export class BadRequestError extends AppError {
  constructor(message = 'Invalid request data. Please check your inputs.', errorCode = 'BAD_REQUEST', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, errorCode, details);
  }
}

/**
 * 401 Unauthenticated Error.
 * Invariant: Strictly named UNAUTHENTICATED (never UNAUTHORIZED).
 * Thrown when authentication is required and has failed or is missing.
 */
export class UnauthenticatedError extends AppError {
  constructor(message = 'Please log in again to continue.', errorCode = 'UNAUTHENTICATED', details = null) {
    super(message, HTTP_STATUS.UNAUTHENTICATED, errorCode, details);
  }
}

/**
 * 403 Forbidden Error.
 * Thrown when client is authenticated but lacks permission to access the resource.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to access this resource.', errorCode = 'FORBIDDEN', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, errorCode, details);
  }
}

/**
 * 404 Not Found Error.
 * Thrown when the requested resource or endpoint does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', errorCode = 'NOT_FOUND', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, errorCode, details);
  }
}

/**
 * 409 Conflict Error.
 * Thrown when a request conflicts with current state of server (e.g. duplicate key).
 */
export class ConflictError extends AppError {
  constructor(message = 'A resource with this information already exists.', errorCode = 'CONFLICT', details = null) {
    super(message, HTTP_STATUS.CONFLICT, errorCode, details);
  }
}

/**
 * 422 Unprocessable Entity / Validation Error.
 * Thrown when request body fails semantic validation rules.
 */
export class ValidationError extends AppError {
  constructor(
    message = 'Please check the entered information and correct any validation issues.',
    details = null,
    errorCode = 'VALIDATION_ERROR'
  ) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errorCode, details);
  }
}

/**
 * 429 Too Many Requests Error.
 * Thrown when rate limit threshold is exceeded.
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please wait a moment and try again.', errorCode = 'TOO_MANY_REQUESTS', details = null) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, errorCode, details);
  }
}

/**
 * 500 Internal Server Error.
 * Generic unexpected server failure error.
 */
export class InternalServerError extends AppError {
  constructor(message = 'Something went wrong on our end. Please try again later.', errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode, details);
  }
}

/**
 * 502 Bad Gateway Error.
 * Thrown when an upstream provider (e.g. Gemini, Addis AI, OAuth) returns an invalid response.
 */
export class BadGatewayError extends AppError {
  constructor(message = 'Upstream provider error occurred. Please try again.', errorCode = 'BAD_GATEWAY', details = null) {
    super(message, HTTP_STATUS.BAD_GATEWAY, errorCode, details);
  }
}

/**
 * 503 Service Unavailable Error.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable. Please try again shortly.', errorCode = 'SERVICE_UNAVAILABLE', details = null) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, errorCode, details);
  }
}

/**
 * 504 Gateway Timeout Error.
 */
export class GatewayTimeoutError extends AppError {
  constructor(message = 'Upstream request timed out. Please try again.', errorCode = 'GATEWAY_TIMEOUT', details = null) {
    super(message, HTTP_STATUS.GATEWAY_TIMEOUT, errorCode, details);
  }
}
