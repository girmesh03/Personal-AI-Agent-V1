/**
 * @module utils/constants
 * @description Centralized application constants, HTTP status codes, and model identifiers.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
