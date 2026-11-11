/**
 * @file backend/src/utils/constants.js
 * @module utils/constants
 * @description Centralized authoritative application constants, HTTP status codes,
 * AI provider configurations, model constraints, and domain limits across Operon (Personal AI Agent V1).
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

// ============================================================================
// Domain Constants (Phase 2 Models & LangChain/LangGraph Engine Alignment)
// ============================================================================

export const USER_NAME_LENGTH = Object.freeze({ MIN: 2, MAX: 50 });
export const USER_POSITION_LENGTH = Object.freeze({ MAX: 100 });
export const DEFAULT_POSITION = '';
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_SALT_ROUNDS = 12;

export const AUTH_CONSTANTS = Object.freeze({
  LOCAL: 'local',
  GOOGLE: 'google',
  BOTH: 'both',
  PROVIDERS: Object.freeze(['local', 'google', 'both']),
  DEFAULT_PROVIDER: 'local',
});

export const AI_PROVIDERS = Object.freeze({
  GOOGLE: 'google',
  ADDIS_AI: 'addis_ai',
  SUPPORTED: Object.freeze(['google', 'addis_ai']),
  DEFAULT: 'google',
});

export const AI_MODELS = Object.freeze({
  // Verified against gemini-api-guides/models.md: 'gemini-3.1-flash-lite' is the exact Gemini 3.1 endpoint (no bare 'gemini-3.1-flash' endpoint exists).
  DEFAULT: 'gemini-3.1-flash-lite',
  PRO: 'gemini-3.8-flash',
  FALLBACK: 'gemini-3-flash-preview',
  ADDIS_DEFAULT: 'addis-1', // Addis-፩-አሌፍ flagship LLM
  GEMINI_SUPPORTED: Object.freeze([
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
  ]),
  ADDIS_SUPPORTED: Object.freeze(['addis-1']),
  SUPPORTED: Object.freeze([
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'addis-1',
  ]),
  BY_PROVIDER: Object.freeze({
    [AI_PROVIDERS.GOOGLE]: Object.freeze([
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3-flash-preview',
    ]),
    [AI_PROVIDERS.ADDIS_AI]: Object.freeze(['addis-1']),
  }),
  DEFAULT_BY_PROVIDER: Object.freeze({
    [AI_PROVIDERS.GOOGLE]: 'gemini-3.1-flash-lite',
    [AI_PROVIDERS.ADDIS_AI]: 'addis-1',
  }),
  STT_ENGINES: Object.freeze([
    'addis_ai',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
  ]),
  DEFAULT_STT_ENGINE: 'addis_ai',
});



export const TTS_CONSTANTS = Object.freeze({
  DEFAULT_AMHARIC_VOICE: 'am-hamen',
  DEFAULT_ENGLISH_VOICE: 'en-emma',
  DEFAULT_SPEED: 1.0,
  MIN_SPEED: 0.75,
  MAX_SPEED: 1.5,
  DEFAULT_AUTO_PLAY: false,
});



export const TELEGRAM_CONSTANTS = Object.freeze({
  FORMATS: Object.freeze(['text', 'image']),
  DEFAULT_FORMAT: 'text',
});

export const CLOUDINARY_CONSTANTS = Object.freeze({
  DEFAULT_FOLDER_PREFIX: 'operon',
  CLOUD_NAME_MAX_LENGTH: 100,
  FOLDER_PREFIX_MAX_LENGTH: 100,
});

export const CHAT_CONSTANTS = Object.freeze({
  // Inherited from Entity 1 User.js contract:
  PROVIDERS: AI_PROVIDERS.SUPPORTED,
  DEFAULT_PROVIDER: AI_PROVIDERS.DEFAULT,
  DEFAULT_PERSONA:
    'Operon — a private, general-purpose personal AI partner for communication, writing, research, planning, decisions, document understanding, and productivity.',
  PERSONA_MAX_LENGTH: 2000,
  DEFAULT_MODEL: AI_MODELS.DEFAULT,
  SUPPORTED_MODELS: AI_MODELS.SUPPORTED,
  DEFAULT_THINKING_BUDGET: 2048,
  MIN_THINKING_BUDGET: 0,
  MAX_THINKING_BUDGET: 24576,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  DEFAULT_TEMPERATURE: 1.0,
  SUPPORTED_LANGUAGES: Object.freeze(['auto', 'am', 'en', 'om', 'ti']),
  DEFAULT_LANGUAGE: 'auto',
  STT_ENGINES: AI_MODELS.STT_ENGINES,
  DEFAULT_STT_ENGINE: AI_MODELS.DEFAULT_STT_ENGINE,

  // Chat Thread & Runtime Extensions:
  TITLE_MAX_LENGTH: 100,
  TITLE_SOURCES: Object.freeze(['auto', 'user']),
  MAX_MESSAGE_LENGTH: 10000,
  PREVIEW_MAX_LENGTH: 200,
  SESSION_INSTRUCTIONS_MAX_LENGTH: 2000,
  COMPACTION_SUMMARY_MAX_LENGTH: 8000,
  DEFAULT_BRANCH_ID: 'main',
  BRANCH_ID_MAX_LENGTH: 64,
  TURN_ID_MAX_LENGTH: 64,
  RUN_ID_MAX_LENGTH: 64,
  MAX_BRANCHES_PER_CHAT: 50,
  BRANCH_LABEL_MAX_LENGTH: 100,
  RUN_MODES: Object.freeze(['send', 'retry', 'continue', 'edit']),
  DEFAULT_RUN_MODE: 'send',
  RUN_STATUSES: Object.freeze([
    'idle',
    'queued',
    'running',
    'waiting_approval',
    'stopping',
    'completed',
    'stopped',
    'failed',
  ]),
  DEFAULT_RUN_STATUS: 'idle',
  TERMINAL_RUN_STATUSES: Object.freeze(['idle', 'completed', 'stopped', 'failed']),
  ACTIVE_RUN_STATUSES: Object.freeze(['queued', 'running', 'waiting_approval', 'stopping']),
  RUN_STAGES: Object.freeze([
    'idle',
    'ingesting_media',
    'thinking',
    'streaming',
    'running_tool',
    'waiting_approval',
    'model_failover',
    'titling',
  ]),
  DEFAULT_RUN_STAGE: 'idle',
  DEFAULT_RUN_LEASE_MS: 120000,
  DEFAULT_APPROVAL_TTL_MS: 900000,
  APPROVAL_DECISIONS: Object.freeze(['approve', 'edit', 'reject']),
  APPROVAL_CATEGORIES: Object.freeze([
    'external_write',
    'destructive',
    'cost_incurring',
    'connector_action',
  ]),
  APPROVAL_SUMMARY_MAX_LENGTH: 1000,
  CHECKPOINT_NS_MAX_LENGTH: 100,
  CHECKPOINT_ID_MAX_LENGTH: 128,
  INTERRUPT_ID_MAX_LENGTH: 128,
  TOOL_CALL_ID_MAX_LENGTH: 128,
  TOOL_NAME_MAX_LENGTH: 100,
  PAYLOAD_HASH_MAX_LENGTH: 128,
  CHECKPOINT_CLEANUP_STATUSES: Object.freeze(['none', 'pending', 'completed', 'failed']),
  DEFAULT_CHECKPOINT_CLEANUP_STATUS: 'none',
  ERROR_MAX_LENGTH: 1000,
  ERROR_CODE_MAX_LENGTH: 100,
  LAST_MESSAGE_ROLES: Object.freeze(['user', 'assistant']),
  ARCHIVE_RETENTION_DAYS: 30,
});

export const CHAT_PAGINATION = Object.freeze({
  DEFAULT_MESSAGES_LIMIT: 30,
  MIN_MESSAGES_LIMIT: 1,
  MAX_MESSAGES_LIMIT: 100,
  DEFAULT_RECENT_CHATS_LIMIT: 20,
  MIN_RECENT_CHATS_LIMIT: 1,
  MAX_RECENT_CHATS_LIMIT: 100,
});

export const MESSAGE_CONSTANTS = Object.freeze({
  ROLES: Object.freeze(['user', 'assistant', 'system']),
  DEFAULT_ROLE: 'user',
  STATUSES: Object.freeze([
    'queued',
    'streaming',
    'waiting_approval',
    'completed',
    'stopped',
    'failed',
  ]),
  DEFAULT_STATUS: 'queued',
  USER_ALLOWED_STATUSES: Object.freeze(['completed']),
  SYSTEM_ALLOWED_STATUSES: Object.freeze(['completed']),
  ACTIVE_STATUSES: Object.freeze(['queued', 'streaming', 'waiting_approval']),
  TERMINAL_STATUSES: Object.freeze(['completed', 'stopped', 'failed']),
  FINISH_REASONS: Object.freeze([
    'stop',
    'length',
    'tool_calls',
    'content_filter',
    'user_abort',
    'timeout',
    'quota_exhausted',
    'error',
    'approval_rejected',
    'failover',
  ]),
  FAILURE_REASONS: Object.freeze([
    'quota_exhausted',
    'model_failover',
    'provider_error',
    'network_error',
    'timeout',
    'unauthorized',
    'validation_error',
    'server_error',
  ]),
  PART_TYPES: Object.freeze(['text', 'step', 'tool', 'asset', 'citation', 'data', 'error']),
  USER_ALLOWED_PART_TYPES: Object.freeze(['text', 'asset']),
  SYSTEM_ALLOWED_PART_TYPES: Object.freeze(['text', 'step', 'data']),
  TEXT_FORMATS: Object.freeze(['markdown', 'plain']),
  DEFAULT_TEXT_FORMAT: 'markdown',
  STEP_STATES: Object.freeze(['active', 'done', 'error']),
  TOOL_STATES: Object.freeze([
    'input-streaming',
    'input-available',
    'approval-requested',
    'approval-responded',
    'output-available',
    'output-error',
    'output-denied',
  ]),
  APPROVAL_DECISION_STATUSES: Object.freeze([
    'pending',
    'approved',
    'edited',
    'rejected',
    'expired',
  ]),
  ASSET_MODALITIES: Object.freeze([
    'image',
    'audio',
    'document',
    'spreadsheet',
    'text',
    'archive',
    'generated_file',
    'tts_audio',
  ]),
  ASSET_PART_ROLES: Object.freeze(['user_upload', 'assistant_output', 'tts_synthesis']),
  ASSET_DELIVERY_MODES: Object.freeze([
    'pending',
    'raw_media',
    'transcript_only',
    'extracted_text',
    'raw_and_transcript',
    'not_applicable',
  ]),
  CITATION_SOURCE_TYPES: Object.freeze(['url', 'asset', 'domain_record', 'memory']),
  USER_TEXT_MAX_LENGTH: CHAT_CONSTANTS.MAX_MESSAGE_LENGTH,
  ASSISTANT_TEXT_MAX_LENGTH: 100000,
  SYSTEM_TEXT_MAX_LENGTH: 20000,
  PART_TEXT_MAX_LENGTH: 100000,
  ID_MAX_LENGTH: 128,
  STEP_KEY_MAX_LENGTH: 64,
  STEP_LABEL_MAX_LENGTH: 200,
  TOOL_CALL_ID_MAX_LENGTH: CHAT_CONSTANTS.TOOL_CALL_ID_MAX_LENGTH,
  TOOL_NAME_MAX_LENGTH: CHAT_CONSTANTS.TOOL_NAME_MAX_LENGTH,
  TOOL_ERROR_MAX_LENGTH: CHAT_CONSTANTS.ERROR_MAX_LENGTH,
  TOOL_OUTPUT_SUMMARY_MAX_LENGTH: 20000,
  GENERATED_ASSET_MAX_PER_TOOL: 10,
  CITATION_TITLE_MAX_LENGTH: 300,
  CITATION_URL_MAX_LENGTH: 2048,
  CITATION_QUOTE_MAX_LENGTH: 1000,
  CITATION_DOMAIN_MODEL_MAX_LENGTH: 64,
  DATA_SCHEMA_NAME_MAX_LENGTH: 100,
  DATA_SCHEMA_VERSION_MAX_LENGTH: 20,
  DATA_SCHEMA_VERSION_REGEX: /^[a-zA-Z0-9._-]+$/,
  MAX_JSON_PAYLOAD_BYTES: 65536,
  MAX_PARTS_PER_MESSAGE: 100,
  MAX_USER_ASSETS_PER_MESSAGE: 10,
  MAX_ASSETS_PER_MESSAGE: 25,
  MAX_OPAQUE_SIGNATURES: 32,
  OPAQUE_SIGNATURE_MAX_BYTES: 16384,
  MAX_SUGGESTED_MODELS: 10,
  HTTP_URL_REGEX: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
});

export const ASSET_CONSTANTS = Object.freeze({
  MODALITY: Object.freeze({
    IMAGE: 'image',
    AUDIO: 'audio',
    DOCUMENT: 'document',
    SPREADSHEET: 'spreadsheet',
    TEXT: 'text',
    ARCHIVE: 'archive',
  }),
  MODALITIES: Object.freeze(['image', 'audio', 'document', 'spreadsheet', 'text', 'archive']),

  KIND: Object.freeze({
    USER_AVATAR: 'user_avatar',
    CHAT_ATTACHMENT: 'chat_attachment',
    AUDIO_RECORDING: 'audio_recording',
    AUDIO_EVIDENCE: 'audio_evidence',
    REPORT_ATTACHMENT: 'report_attachment',
    GENERATED_DOCUMENT: 'generated_document',
    TTS_AUDIO: 'tts_audio',
    SYSTEM_EXPORT: 'system_export',
  }),
  KINDS: Object.freeze([
    'user_avatar',
    'chat_attachment',
    'audio_recording',
    'audio_evidence',
    'report_attachment',
    'generated_document',
    'tts_audio',
    'system_export',
  ]),

  STORAGE_DRIVER: Object.freeze({
    LOCAL: 'local',
    CLOUDINARY: 'cloudinary',
    GOOGLE_DRIVE: 'google_drive',
  }),
  STORAGE_DRIVERS: Object.freeze(['local', 'cloudinary', 'google_drive']),
  DEFAULT_STORAGE_DRIVER: 'local',

  LIFECYCLE_STATUS: Object.freeze({
    PENDING_UPLOAD: 'pending_upload',
    STORED: 'stored',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
    ARCHIVED: 'archived',
    DELETED: 'deleted',
  }),
  LIFECYCLE_STATUSES: Object.freeze([
    'pending_upload',
    'stored',
    'processing',
    'ready',
    'failed',
    'archived',
    'deleted',
  ]),
  DEFAULT_LIFECYCLE_STATUS: 'ready',

  RETENTION_POLICY: Object.freeze({
    STANDARD: 'standard',
    PERSISTENT: 'persistent',
    EPHEMERAL: 'ephemeral',
  }),
  RETENTION_POLICIES: Object.freeze(['standard', 'persistent', 'ephemeral']),
  DEFAULT_RETENTION_POLICY: 'standard',

  TRANSCRIPTION_STATUS: Object.freeze({
    NONE: 'none',
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  }),
  TRANSCRIPTION_STATUSES: Object.freeze(['none', 'pending', 'processing', 'completed', 'failed']),

  EXTRACTION_STATUS: Object.freeze({
    NONE: 'none',
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  }),
  EXTRACTION_STATUSES: Object.freeze(['none', 'pending', 'processing', 'completed', 'failed']),

  EXTRACTION_METHOD: Object.freeze({
    DETERMINISTIC_PLAIN: 'deterministic_plain',
    MAMMOTH_DOCX: 'mammoth_docx',
    XLSX_CSV: 'xlsx_csv',
    PDF_TEXT: 'pdf_text',
    GEMINI_MULTIMODAL: 'gemini_multimodal',
  }),
  EXTRACTION_METHODS: Object.freeze([
    'deterministic_plain',
    'mammoth_docx',
    'xlsx_csv',
    'pdf_text',
    'gemini_multimodal',
  ]),

  STT_ENGINES: Object.freeze([
    'addis_ai',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
  ]),

  GENERATED_FORMATS: Object.freeze(['pdf', 'docx', 'xlsx', 'csv', 'markdown', 'md', 'json']),

  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  MAX_AVATAR_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_AUDIO_SIZE_BYTES: 25 * 1024 * 1024,
  MAX_BATCH_SIZE_BYTES: 50 * 1024 * 1024,
  MAX_FILES_PER_UPLOAD: 5,

  MAX_AUDIO_DURATION_SECONDS: 7200,
  MAX_WAVEFORM_POINTS: 100,

  FILENAME_MAX_LENGTH: 255,
  STORAGE_KEY_MAX_LENGTH: 512,
  PUBLIC_ID_MAX_LENGTH: 255,
  CLOUD_URL_MAX_LENGTH: 2048,
  MIME_TYPE_MAX_LENGTH: 127,
  ERROR_MESSAGE_MAX_LENGTH: 1000,
  TRANSCRIPTION_MAX_LENGTH: 100000,
  EXTRACTED_TEXT_MAX_LENGTH: 100000,
  TTS_TEXT_SNIPPET_MAX_LENGTH: 500,

  EPHEMERAL_TTL_MS: 24 * 60 * 60 * 1000,
  ARCHIVED_TTL_MS: 30 * 24 * 60 * 60 * 1000,

  ALLOWED_IMAGE_MIME_TYPES: Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/heic',
    'image/heif',
  ]),
  ALLOWED_IMAGE_EXTENSIONS: Object.freeze([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.svg',
    '.heic',
    '.heif',
  ]),

  ALLOWED_AUDIO_MIME_TYPES: Object.freeze([
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/flac',
  ]),
  ALLOWED_AUDIO_EXTENSIONS: Object.freeze([
    '.wav',
    '.mp3',
    '.m4a',
    '.webm',
    '.ogg',
    '.aac',
    '.flac',
  ]),

  ALLOWED_DOCUMENT_MIME_TYPES: Object.freeze([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]),
  ALLOWED_DOCUMENT_EXTENSIONS: Object.freeze(['.pdf', '.docx', '.doc']),

  ALLOWED_SPREADSHEET_MIME_TYPES: Object.freeze([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
  ]),
  ALLOWED_SPREADSHEET_EXTENSIONS: Object.freeze(['.xlsx', '.xls', '.csv']),

  ALLOWED_TEXT_MIME_TYPES: Object.freeze([
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/json',
    'text/json',
  ]),
  ALLOWED_TEXT_EXTENSIONS: Object.freeze(['.txt', '.md', '.markdown', '.json']),

  ALLOWED_ARCHIVE_MIME_TYPES: Object.freeze([
    'application/zip',
    'application/x-zip-compressed',
  ]),
  ALLOWED_ARCHIVE_EXTENSIONS: Object.freeze(['.zip']),

  ALLOWED_MIME_TYPES: Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/heic',
    'image/heif',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/flac',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/json',
    'text/json',
    'application/zip',
    'application/x-zip-compressed',
  ]),

  ALLOWED_EXTENSIONS: Object.freeze([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.svg',
    '.heic',
    '.heif',
    '.wav',
    '.mp3',
    '.m4a',
    '.webm',
    '.ogg',
    '.aac',
    '.flac',
    '.pdf',
    '.docx',
    '.doc',
    '.xlsx',
    '.xls',
    '.csv',
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.zip',
  ]),
});

export const BRANCH_CONSTANTS = Object.freeze({
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  CODE_MIN_LENGTH: 2,
  CODE_MAX_LENGTH: 20,
  CITY_MAX_LENGTH: 100,
  SUBCITY_MAX_LENGTH: 100,
  ADDRESS_MAX_LENGTH: 255,
  MANAGER_NAME_MAX_LENGTH: 100,
  CONTACT_PHONE_MAX_LENGTH: 30,
  DEFAULT_CITY: 'Addis Ababa',
  SEARCH_MAX_LENGTH: 100,
  PAGE_LIMIT_MIN: 1,
  PAGE_LIMIT_MAX: 100,
  DEFAULT_PAGE_LIMIT: 20,
  ARCHIVE_RETENTION_DAYS: 30,
  OPERATIONAL_STATUSES: Object.freeze(['operational', 'temporarily_closed', 'under_renovation']),
  DEFAULT_OPERATIONAL_STATUS: 'operational',
});

export const REPORT_CONSTANTS = Object.freeze({
  TIME_REGEX: /^([01]\d|2[0-3]):([0-5]\d)$/,
  ETHIOPIAN_DATE_REGEX: /^\d{2}[-/]\d{2}[-/]\d{2,4}$/,
  ACTIVITY_STATUSES: Object.freeze(['in_progress', 'completed']),
  DEFAULT_ACTIVITY_STATUS: 'completed',
  ISSUE_STATUSES: Object.freeze(['reported', 'completed', 'in_progress', 'no_issue']),
  DEFAULT_ISSUE_STATUS: 'reported',
  MAX_ASSETS: 30,
  ARCHIVE_RETENTION_DAYS: 30,
  PAGE_LIMIT_DEFAULT: 10,
  PAGE_LIMIT_MIN: 1,
  PAGE_LIMIT_MAX: 100,
  ACTIVITY_TEXT_MAX_LENGTH: 1000,
  ISSUE_TEXT_MAX_LENGTH: 1000,
  COMMENT_TEXT_MAX_LENGTH: 2000,
  NARRATION_MAX_LENGTH: 50000,
});
