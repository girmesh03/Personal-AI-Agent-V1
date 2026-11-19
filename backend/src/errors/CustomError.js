/**
 * @module errors/CustomError
 * @description Centralized domain operational error hierarchy for structured API error handling.
 */

import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Base operational error class.
 * All predictable application exceptions extend this class.
 *
 * @class CustomError
 * @extends Error
 */
export class CustomError extends Error {
  /**
   * @param {string} message - Human-readable error description.
   * @param {number} statusCode - Standard HTTP status code.
   * @param {string} errorCode - Machine-readable error code string.
   * @param {Array<object>|null} [details=null] - Optional detailed validation or context errors.
   */
  constructor(message, statusCode, errorCode, details = null) {
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
 * 400 Bad Request Error.
 * Thrown when client sends invalid syntax or malformed requests.
 * @class BadRequestError
 * @extends CustomError
 */
export class BadRequestError extends CustomError {
  /**
   * @param {string} [message='Invalid request data. Please check your inputs.'] - Error message.
   * @param {string} [errorCode='BAD_REQUEST'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Invalid request data. Please check your inputs.', errorCode = 'BAD_REQUEST', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, errorCode, details);
  }
}

/**
 * 401 Unauthenticated Error.
 * Strictly named UNAUTHENTICATED (never UNAUTHORIZED).
 * Thrown when authentication is required and has failed or has not been provided.
 * @class UnauthenticatedError
 * @extends CustomError
 */
export class UnauthenticatedError extends CustomError {
  /**
   * @param {string} [message='Please log in to continue.'] - Error message.
   * @param {string} [errorCode='UNAUTHENTICATED'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Please log in to continue.', errorCode = 'UNAUTHENTICATED', details = null) {
    super(message, HTTP_STATUS.UNAUTHENTICATED, errorCode, details);
  }
}

/**
 * 403 Forbidden Error.
 * Thrown when client is authenticated but lacks access rights to the resource.
 * @class ForbiddenError
 * @extends CustomError
 */
export class ForbiddenError extends CustomError {
  /**
   * @param {string} [message='You do not have permission to access this resource.'] - Error message.
   * @param {string} [errorCode='FORBIDDEN'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'You do not have permission to access this resource.', errorCode = 'FORBIDDEN', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, errorCode, details);
  }
}

/**
 * 404 Not Found Error.
 * Thrown when the requested resource cannot be found.
 * @class NotFoundError
 * @extends CustomError
 */
export class NotFoundError extends CustomError {
  /**
   * @param {string} [message='The requested endpoint or resource was not found.'] - Error message.
   * @param {string} [errorCode='NOT_FOUND'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The requested endpoint or resource was not found.', errorCode = 'NOT_FOUND', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, errorCode, details);
  }
}

/**
 * 409 Conflict Error.
 * Thrown when a request conflicts with the current state of the server (e.g. duplicate resource).
 * @class ConflictError
 * @extends CustomError
 */
export class ConflictError extends CustomError {
  /**
   * @param {string} [message='A resource with this information already exists.'] - Error message.
   * @param {string} [errorCode='CONFLICT'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'A resource with this information already exists.', errorCode = 'CONFLICT', details = null) {
    super(message, HTTP_STATUS.CONFLICT, errorCode, details);
  }
}

/**
 * 413 Payload Too Large Error.
 * Thrown when incoming request body exceeds payload limits.
 * @class PayloadTooLargeError
 * @extends CustomError
 */
export class PayloadTooLargeError extends CustomError {
  /**
   * @param {string} [message='Request payload exceeds the maximum allowed size.'] - Error message.
   * @param {string} [errorCode='PAYLOAD_TOO_LARGE'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(
    message = 'Request payload exceeds the maximum allowed size.',
    errorCode = 'PAYLOAD_TOO_LARGE',
    details = null
  ) {
    super(message, HTTP_STATUS.PAYLOAD_TOO_LARGE, errorCode, details);
  }
}

/**
 * 422 Unprocessable Entity / Validation Error.
 * Thrown when request body fails semantic validation rules.
 * @class ValidationError
 * @extends CustomError
 */
export class ValidationError extends CustomError {
  /**
   * @param {string} [message='Please check the entered information and correct any validation issues.'] - Error message.
   * @param {Array<object>|null} [details=null] - Field-specific validation error objects.
   * @param {string} [errorCode='VALIDATION_ERROR'] - Machine-readable error code.
   */
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
 * @class TooManyRequestsError
 * @extends CustomError
 */
export class TooManyRequestsError extends CustomError {
  /**
   * @param {string} [message='Too many requests. Please wait a moment and try again.'] - Error message.
   * @param {string} [errorCode='TOO_MANY_REQUESTS'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Too many requests. Please wait a moment and try again.', errorCode = 'TOO_MANY_REQUESTS', details = null) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, errorCode, details);
  }
}

/**
 * 500 Internal Server Error.
 * Generic unexpected server failure error.
 * @class InternalServerError
 * @extends CustomError
 */
export class InternalServerError extends CustomError {
  /**
   * @param {string} [message='Something went wrong on our end. Please try again later.'] - Error message.
   * @param {string} [errorCode='INTERNAL_SERVER_ERROR'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'Something went wrong on our end. Please try again later.', errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode, details);
  }
}

/**
 * 502 Bad Gateway Error.
 * Thrown when an upstream provider returns an invalid response.
 * @class BadGatewayError
 * @extends CustomError
 */
export class BadGatewayError extends CustomError {
  /**
   * @param {string} [message='The service is temporarily unavailable. Please try again later.'] - Error message.
   * @param {string} [errorCode='BAD_GATEWAY'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The service is temporarily unavailable. Please try again later.', errorCode = 'BAD_GATEWAY', details = null) {
    super(message, HTTP_STATUS.BAD_GATEWAY, errorCode, details);
  }
}

/**
 * 503 Service Unavailable Error.
 * Thrown when server is overloaded or undergoing maintenance.
 * @class ServiceUnavailableError
 * @extends CustomError
 */
export class ServiceUnavailableError extends CustomError {
  /**
   * @param {string} [message='The service is temporarily unavailable. Please try again later.'] - Error message.
   * @param {string} [errorCode='SERVICE_UNAVAILABLE'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The service is temporarily unavailable. Please try again later.', errorCode = 'SERVICE_UNAVAILABLE', details = null) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, errorCode, details);
  }
}

/**
 * 504 Gateway Timeout Error.
 * Thrown when an upstream service response times out.
 * @class GatewayTimeoutError
 * @extends CustomError
 */
export class GatewayTimeoutError extends CustomError {
  /**
   * @param {string} [message='The request timed out. Please try again later.'] - Error message.
   * @param {string} [errorCode='GATEWAY_TIMEOUT'] - Machine-readable error code.
   * @param {Array<object>|null} [details=null] - Optional error details.
   */
  constructor(message = 'The request timed out. Please try again later.', errorCode = 'GATEWAY_TIMEOUT', details = null) {
    super(message, HTTP_STATUS.GATEWAY_TIMEOUT, errorCode, details);
  }
}

export default {
  CustomError,
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PayloadTooLargeError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
};
