/**
 * @module utils/constants
 * @description Centralized client-side constants, validation thresholds, HTTP status codes,
 * and AI model identifiers in 1-to-1 parity with backend constants.
 */

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
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
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
 * Password validation regex enforcing at least 8 characters,
 * 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.
 * @constant
 * @type {RegExp}
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Authoritative AI provider identifiers (Protocol 63).
 * Namespaces supported AI model providers across the platform.
 * @constant
 * @type {Readonly<{ GOOGLE: string, ADDIS: string }>}
 */
export const AI_PROVIDERS = Object.freeze({
  GOOGLE: 'google',
  ADDIS: 'addis',
});

/**
 * Authoritative AI foundation model identifiers (Protocol 28, 63, 69).
 * Namespaced strictly by provider; pure verified models only; zero root fallback aliases.
 * @constant
 * @type {Readonly<{
 *   google: Readonly<{ DEFAULT: string, PRO: string, FALLBACK: string, MODELS: readonly string[] }>,
 *   addis: Readonly<{ DEFAULT: string, MODELS: readonly string[] }>
 * }>}
 */
export const AI_MODELS = Object.freeze({
  [AI_PROVIDERS.GOOGLE]: Object.freeze({
    DEFAULT: 'gemini-3.1-flash-lite',
    PRO: 'gemini-3.8-flash',
    FALLBACK: 'gemini-3-flash-preview',
    MODELS: Object.freeze([
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3-flash-preview',
    ]),
  }),
  [AI_PROVIDERS.ADDIS]: Object.freeze({
    DEFAULT: 'addis-1',
    MODELS: Object.freeze(['addis-1']),
  }),
});

/**
 * Global roster of all supported AI foundation models across all providers (Protocol 69).
 * @constant
 * @type {readonly string[]}
 */
export const SUPPORTED_AI_MODELS = Object.freeze([
  ...AI_MODELS[AI_PROVIDERS.GOOGLE].MODELS,
  ...AI_MODELS[AI_PROVIDERS.ADDIS].MODELS,
]);

/**
 * Dynamic mapping of each supported foundation model to its authoritative AI provider (Protocol 69).
 * Derived automatically from AI_MODELS via Object.entries().
 * @constant
 * @type {Readonly<Record<string, string>>}
 */
export const MODEL_PROVIDER_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries(AI_MODELS).flatMap(([provider, cfg]) =>
      cfg.MODELS.map((model) => [model, provider])
    )
  )
);

/**
 * Metadata and upstream API configuration per AI provider (Protocol 63).
 * @constant
 */
export const AI_PROVIDER_CONFIG = Object.freeze({
  [AI_PROVIDERS.GOOGLE]: Object.freeze({
    name: 'Google Gemini',
    apiKeyField: 'geminiApiKey',
    hasKeyField: 'hasGeminiKey',
    authHeader: 'x-goog-api-key',
    supportsThinkingBudget: true,
  }),
  [AI_PROVIDERS.ADDIS]: Object.freeze({
    name: 'Addis AI',
    baseURL: 'https://api.addisassistant.com/v1',
    nativeBaseURL: 'https://api.addisassistant.com',
    apiKeyField: 'addisApiKey',
    hasKeyField: 'hasAddisKey',
    authHeader: 'x-api-key',
    supportsThinkingBudget: false,
  }),
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
 * Conversational agent configuration boundaries and defaults.
 * @constant
 */
export const CHAT_CONSTANTS = Object.freeze({
  DEFAULT_PROVIDER: AI_PROVIDERS.GOOGLE,
  SUPPORTED_PROVIDERS: Object.freeze([AI_PROVIDERS.GOOGLE, AI_PROVIDERS.ADDIS]),
  DEFAULT_MODEL: AI_MODELS[AI_PROVIDERS.GOOGLE].DEFAULT,
  SUPPORTED_MODELS: SUPPORTED_AI_MODELS,
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

/**
 * Telegram integration configuration defaults and supported formats.
 * @constant
 */
export const TELEGRAM_CONSTANTS = Object.freeze({
  FORMATS: Object.freeze(['text', 'image']),
  DEFAULT_FORMAT: 'text',
});
