/**
 * @module utils/constants
 * @description Centralized application constants, validation thresholds, HTTP status codes,
 * and AI model definitions for backend operations.
 */

import { env, parseDurationToMs } from '../config/env.js';

/**
 * Standard HTTP Status Codes.
 * Strict naming invariant: 401 is exclusively UNAUTHENTICATED (never UNAUTHORIZED).
 * @constant
 * @type {Readonly<Record<string, number>>}
 */
export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
});

/**
 * Authoritative AI foundation model identifiers (Protocol 28).
 * Pure verified models only; zero legacy (gemini-2.5-*) or phantom (gemini-3.5-flash) models.
 * @constant
 */
export const AI_MODELS = Object.freeze({
  DEFAULT: 'gemini-3.1-flash-lite',
  PRO: 'gemini-3.8-flash',
  FALLBACK: 'gemini-3-flash-preview',
  REGIONAL: 'addis-1',
  SUPPORTED: Object.freeze([
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'addis-1',
  ]),
});

/**
 * Canonical Speech-to-Text (STT) engine identifiers.
 * @constant
 */
export const STT_ENGINES = Object.freeze({
  ADDIS_AI: 'addis_ai',
  GEMINI_FLASH: 'gemini-3.8-flash',
  GEMINI_FLASH_LITE: 'gemini-3.1-flash-lite',
});

/**
 * Standard email validation regex format.
 * @constant
 * @type {RegExp}
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Name length boundaries for user profiles.
 * @constant
 * @type {Readonly<{ MIN: number, MAX: number }>}
 */
export const USER_NAME_LENGTH = Object.freeze({
  MIN: 2,
  MAX: 50,
});

/**
 * Minimum password length requirement.
 * @constant
 * @type {number}
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Bcrypt salt rounds factor for password hashing.
 * @constant
 * @type {number}
 */
export const BCRYPT_SALT_ROUNDS = 12;

/**
 * JWT token lifespan configuration referencing validated environment variables.
 * @constant
 * @type {Readonly<{ ACCESS: string, REFRESH: string }>}
 */
export const JWT_EXPIRY = Object.freeze({
  ACCESS: env.JWT_ACCESS_EXPIRES_IN,
  REFRESH: env.JWT_REFRESH_EXPIRES_IN,
});

/**
 * HTTP cookie maximum age in milliseconds derived dynamically from validated environment variables.
 * @constant
 * @type {Readonly<{ ACCESS: number, REFRESH: number }>}
 */
export const COOKIE_MAX_AGE = Object.freeze({
  ACCESS: parseDurationToMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60 * 1000),
  REFRESH: parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000),
});

/**
 * Conversational agent configuration boundaries and defaults.
 * @constant
 */
export const CHAT_CONSTANTS = Object.freeze({
  DEFAULT_MODEL: AI_MODELS.DEFAULT,
  SUPPORTED_MODELS: AI_MODELS.SUPPORTED,
  STT_ENGINES: Object.freeze([
    STT_ENGINES.ADDIS_AI,
    STT_ENGINES.GEMINI_FLASH,
    STT_ENGINES.GEMINI_FLASH_LITE,
  ]),
  DEFAULT_STT_ENGINE: STT_ENGINES.ADDIS_AI,
  DEFAULT_THINKING_BUDGET: 0,
  MIN_THINKING_BUDGET: 0,
  MAX_THINKING_BUDGET: 24576,
  DEFAULT_LANGUAGE: 'auto',
  SUPPORTED_LANGUAGES: Object.freeze(['auto', 'am', 'en']),
  DEFAULT_PERSONA: 'Professional Operational Assistant',
});

/**
 * Text-to-Speech (TTS) configuration defaults and boundaries.
 * @constant
 */
export const TTS_CONSTANTS = Object.freeze({
  DEFAULT_AMHARIC_VOICE: 'am-ET-Standard-A',
  DEFAULT_ENGLISH_VOICE: 'en-US-Standard-C',
  DEFAULT_SPEED: 1.0,
  MIN_SPEED: 0.5,
  MAX_SPEED: 2.0,
});

/**
 * Operational report configuration thresholds.
 * @constant
 */
export const REPORT_CONSTANTS = Object.freeze({
  TEMPLATE_MAX_LENGTH: 5000,
});
