/**
 * @module utils/constants
 * @description Centralized application constants, HTTP status codes, and model identifiers.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, parseDurationToMs } from '../config/env.js';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Standard HTTP Status Codes.
 * Strict naming invariant: 401 is UNAUTHENTICATED (UNAUTHORIZED alias provided for compatibility).
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
  UNAUTHORIZED: 401,
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
 * Deterministically resolved uploads storage directories.
 * Anchored to backend/uploads/ regardless of process.cwd().
 * @constant
 */
export const UPLOADS_CONFIG = Object.freeze({
  ROOT_DIR: path.resolve(BACKEND_ROOT, 'uploads'),
  AVATARS_DIR: path.resolve(BACKEND_ROOT, 'uploads/avatars'),
  IMAGES_DIR: path.resolve(BACKEND_ROOT, 'uploads/images'),
  FILES_DIR: path.resolve(BACKEND_ROOT, 'uploads/files'),
  AUDIOS_DIR: path.resolve(BACKEND_ROOT, 'uploads/audios'),
  ATTACHMENTS_DIR: path.resolve(BACKEND_ROOT, 'uploads/attachments'),
  TEMP_DIR: path.resolve(BACKEND_ROOT, 'uploads/temp'),
  DOMAIN_DIRS: Object.freeze({
    avatars: path.resolve(BACKEND_ROOT, 'uploads/avatars'),
    images: path.resolve(BACKEND_ROOT, 'uploads/images'),
    files: path.resolve(BACKEND_ROOT, 'uploads/files'),
    audios: path.resolve(BACKEND_ROOT, 'uploads/audios'),
    temp: path.resolve(BACKEND_ROOT, 'uploads/temp'),
  }),
});

/**
 * Centralized AI Model governance and identifiers.
 * Single Source of Truth for Gemini models, quota failover mappings, and STT engines.
 * @constant
 */
export const AI_MODELS = Object.freeze({
  DEFAULT: 'gemini-3.1-flash-lite',
  FALLBACK: 'gemini-3-flash-preview',
  PRO: 'gemini-3.8-flash',
  SUPPORTED: Object.freeze([
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ]),
  QUOTA_RETRY_MAP: Object.freeze({
    'gemini-3.8-flash': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite': 'gemini-3-flash-preview',
    'gemini-3-flash-preview': 'gemini-3.5-flash',
    'gemini-3.5-flash': 'gemini-3.1-flash-lite',
  }),
  STT_ENGINES: Object.freeze(['addis_ai', 'gemini-3.8-flash', 'gemini-3.1-flash-lite']),
  DEFAULT_STT_ENGINE: 'addis_ai',
  DEFAULT_AUDIO_CHUNKER_MODEL: 'gemini-3.1-flash-lite',
});

/**
 * Canonical display labels for AI models.
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
export const AI_MODEL_LABELS = Object.freeze({
  [AI_MODELS.DEFAULT]: 'Gemini 3.1 Flash Lite',
  [AI_MODELS.PRO]: 'Gemini 3.8 Flash',
  [AI_MODELS.FALLBACK]: 'Gemini 3 Flash Preview',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
});

/**
 * Canonical display labels for Speech-to-Text (STT) engines.
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
export const STT_ENGINE_LABELS = Object.freeze({
  addis_ai: 'Addis AI',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
});

/**
 * Returns human-friendly display name for an AI model identifier.
 * @param {string} [rawModel]
 * @returns {string} User-facing model name (e.g. "Gemini 3.1 Flash Lite").
 */
export const formatModelDisplayName = (rawModel) => {
  if (!rawModel) return 'Operon';
  if (AI_MODEL_LABELS[rawModel]) return AI_MODEL_LABELS[rawModel];
  return rawModel;
};

/**
 * Returns user-facing display label for an STT engine identifier.
 * @param {string} [engine]
 * @returns {string} Human-friendly display label (e.g. "Addis AI", "Gemini 3.8 Flash").
 */
export const formatSttEngineDisplayName = (engine) => {
  if (!engine) return 'Addis AI';
  if (STT_ENGINE_LABELS[engine]) return STT_ENGINE_LABELS[engine];
  if (AI_MODEL_LABELS[engine]) return AI_MODEL_LABELS[engine];
  return engine;
};

/**
 * Password validation regex enforcing at least 8 characters,
 * 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.
 * @constant
 * @type {RegExp}
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

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
 * HTTP cookie maximum age in milliseconds derived directly from JWT expiration settings.
 * @constant
 * @type {Readonly<{ ACCESS: number, REFRESH: number }>}
 */
export const COOKIE_MAX_AGE = Object.freeze({
  ACCESS: parseDurationToMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60 * 1000),
  REFRESH: parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000),
});

/**
 * Default corporate/profile position title.
 * @constant
 * @type {string}
 */
export const DEFAULT_POSITION = 'Area Supervisor';

/**
 * User avatar image constants and MIME whitelist.
 * @constant
 * @type {Readonly<{
 *   MAX_FILE_SIZE_BYTES: number,
 *   ALLOWED_EXTENSIONS: string[],
 *   ALLOWED_MIME_TYPES: string[],
 * }>}
 */
export const AVATAR_CONSTANTS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
});

/**
 * Default chat session and AI agent engine constants.
 * @constant
 */
export const CHAT_CONSTANTS = Object.freeze({
  DEFAULT_PERSONA:
    'Personal AI Agent and Executive Operations Partner for multi-branch operations, professional leadership, and personal productivity.',
  DEFAULT_MODEL: AI_MODELS.DEFAULT,
  SUPPORTED_MODELS: AI_MODELS.SUPPORTED,
  DEFAULT_THINKING_BUDGET: 2048,
  MIN_THINKING_BUDGET: 0,
  MAX_THINKING_BUDGET: 8192,
  DEFAULT_LANGUAGE: 'am',
  SUPPORTED_LANGUAGES: ['am', 'en', 'auto'],
  DEFAULT_TEMPERATURE: 0.2,
  STT_ENGINES: AI_MODELS.STT_ENGINES,
  DEFAULT_STT_ENGINE: AI_MODELS.DEFAULT_STT_ENGINE,
  TITLE_MAX_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 10000,
});

/**
 * Asset storage, media category, and private access constants (Phase 3).
 * @constant
 */
export const ASSET_CONSTANTS = Object.freeze({
  STORAGE_PROVIDERS: Object.freeze(['local_disk', 'cloudinary', 's3']),
  DEFAULT_STORAGE_PROVIDER: 'local_disk',
  CATEGORIES: Object.freeze(['document', 'image', 'audio', 'video', 'archive', 'other']),
  STATUSES: Object.freeze(['uploading', 'ready', 'processing', 'failed', 'deleted']),
  RETENTION_POLICIES: Object.freeze(['temporary', 'persistent']),
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB general limit
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS: 900, // 15 minutes
  ALLOWED_DOCUMENT_EXTENSIONS: Object.freeze(['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.json']),
  ALLOWED_IMAGE_EXTENSIONS: Object.freeze(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']),
  ALLOWED_AUDIO_EXTENSIONS: Object.freeze(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm']),
  ALLOWED_MIME_TYPES: Object.freeze([
    // Documents
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'text/markdown',
    'application/json',
    // Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // Audio
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
  ]),
});

