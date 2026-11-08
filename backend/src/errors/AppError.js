/**
 * @module errors/AppError
 * @description Standardized operational error classes inheriting from Error for structured HTTP exception handling.
 */

import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Base operational application error.
 * Represents expected, operational HTTP exceptions with status codes and structured details.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} [statusCode=500] - HTTP status code.
   * @param {string} [code='APP_ERROR'] - Machine-readable error code.
   * @param {Array<object>|object} [details=[]] - Optional structured validation or diagnostic details.
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = 'APP_ERROR', details = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Formats this error using the universal error formatter.
   * @param {object} [req] - Express request object for correlation ID.
   * @returns {{ statusCode: number, success: boolean, error: object, payload: object }}
   */
  format(req) {
    if (typeof this._formatter === 'function') {
      return this._formatter(this, req);
    }
    return {
      statusCode: this.statusCode,
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: new Date().toISOString(),
        correlationId: req?.id || 'unknown',
      },
      payload: {
        success: false,
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
          timestamp: new Date().toISOString(),
          correlationId: req?.id || 'unknown',
        },
      },
    };
  }

  /**
   * Returns the clean JSON response payload for Express res.json().
   * @param {object} [req] - Express request object.
   * @returns {object} Response JSON payload { success: false, error: { ... } }
   */
  toResponse(req) {
    return this.format(req).payload;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access', details = []) {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access', details = []) {
    super(message, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = []) {
    super(message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = []) {
    super(message, HTTP_STATUS.CONFLICT, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later', details = []) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details = []) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_SERVER_ERROR', details);
    this.isOperational = false;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details = []) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', details);
  }
}

export default AppError;
