/**
 * @module utils/constants
 * @description Centralized application constants, HTTP status codes, and configuration defaults.
 */

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
});

export const ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
});

export const API_PREFIX = '/api/v1';

export const TIMEOUTS = Object.freeze({
  SERVER_SELECTION_MS: 30000,
  SOCKET_TIMEOUT_MS: 45000,
  SHUTDOWN_TIMEOUT_MS: 10000,
});

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

export const SENSITIVE_KEYS = Object.freeze([
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'key',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
]);
