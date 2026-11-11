/**
 * @file backend/src/models/User.js
 * @module models/User
 * @description Authoritative user account model for Operon (Personal AI Agent V1).
 * Represents the single-user account identity, preferences, directives SSOT,
 * and AES-256-GCM encrypted BYOK credentials.
 * 
 * Architectural Invariants:
 * 1. Single-User Isolation: Strict server-side user boundary. Strictly zero role, zero RBAC, zero organization tenancy.
 * 2. BYOK Credential Protection: API keys and connector secrets are encrypted at rest, marked select: false, and stripped from transforms.
 * 3. Directives SSOT: settings.directives stores system instructions and phrase mappings for LangChain agent prompt injection.
 * 4. Avatar Linkage: Uses a direct ObjectId reference (ref: 'Asset', default: null) pointing to the Asset model.
 * 5. Gemini 3 + Addis AI Scope: Provider configuration strictly restricted to Google Gemini 3 family and Addis AI.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BASE_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import {
  USER_NAME_LENGTH,
  USER_POSITION_LENGTH,
  DEFAULT_POSITION,
  EMAIL_REGEX,
  PASSWORD_MIN_LENGTH,
  BCRYPT_SALT_ROUNDS,
  AUTH_CONSTANTS,
  AI_PROVIDERS,
  AI_MODELS,
  CHAT_CONSTANTS,
  TTS_CONSTANTS,
  REPORT_CONSTANTS,
  TELEGRAM_CONSTANTS,
  CLOUDINARY_CONSTANTS,
} from '../utils/constants.js';

/**
 * @typedef {Object} IUserDirectives
 * @property {string[]} [negativeVocabulary] - Forbidden words and phrases strictly excluded from assistant outputs.
 * @property {Map<string, string>} [phraseMappings] - Domain-specific shorthand to corporate wording mappings.
 * @property {string[]} [userInstructions] - Discrete persistent system instructions injected into agent prompts.
 */

/**
 * @typedef {Object} IUserAgentConfig
 * @property {string} [persona] - Configurable agent persona description.
 * @property {'google'|'addis_ai'} [defaultProvider] - Primary AI provider for agent operations.
 * @property {string} [defaultModel] - Default model identifier (Gemini 3 family or Addis-1).
 * @property {number} [defaultThinkingBudget] - Default reasoning token budget (0 to 24576).
 * @property {number} [defaultTemperature] - Default sampling temperature (0.0 to 2.0).
 * @property {string} [defaultLanguage] - Interaction language ('auto'|'am'|'en'|'om'|'ti').
 */

/**
 * @typedef {Object} IUserTTS
 * @property {string} [amharicVoice] - Default voice identifier for Amharic speech synthesis.
 * @property {string} [englishVoice] - Default voice identifier for English speech synthesis.
 * @property {number} [speed] - Speech rate multiplier (0.75 to 1.5).
 * @property {boolean} [autoPlay] - Flag to automatically stream/play audio responses.
 */

/**
 * @typedef {Object} IUserReportTemplates
 * @property {string|null} [singleBranch] - Markdown template for single-branch operational reports.
 * @property {string|null} [multiBranch] - Markdown template for multi-branch operational reports.
 */

/**
 * @typedef {Object} IUserApiKeys
 * @property {boolean} [hasGeminiKey=false] - Read-only boolean indicating configured Google Gemini API key.
 * @property {boolean} [hasAddisKey=false] - Read-only boolean indicating configured Addis AI API key.
 * @property {string|null} [geminiApiKey=null] - Encrypted Google Gemini API key (select: false).
 * @property {string|null} [addisApiKey=null] - Encrypted Addis AI API key (select: false).
 */

/**
 * @typedef {Object} IUserSettings
 * @property {string} [sttEngine] - Default speech-to-text engine identifier.
 * @property {IUserAgentConfig} [agentConfig] - Configurable agent persona and default model parameters.
 * @property {IUserTTS} [tts] - Text-to-speech voice and playback preferences.
 * @property {IUserDirectives} [directives] - Supervisor vocabulary rules, constraints, and instructions.
 * @property {IUserApiKeys} [apiKeys] - BYOK AI provider API keys with encrypted storage.
 * @property {IUserReportTemplates} [reportTemplates] - Domain operational report templates.
 */

/**
 * @typedef {Object} IUserGoogleDrive
 * @property {boolean} [connected=false] - Connection status flag.
 * @property {boolean} [enabled=true] - Toggle flag for Google Drive integration.
 * @property {string|null} [email=null] - Connected Google account email address.
 * @property {string|null} [accessToken=null] - OAuth2 access token (select: false).
 * @property {string|null} [refreshToken=null] - OAuth2 refresh token (select: false).
 * @property {number|null} [expiryDate=null] - Token expiration timestamp (select: false).
 * @property {string[]} [scope=[]] - Granted OAuth scopes.
 * @property {string|null} [rootFolderId=null] - Target Google Drive root folder ID.
 * @property {Date|null} [connectedAt=null] - Connection establishment timestamp.
 */

/**
 * @typedef {Object} IUserTelegram
 * @property {boolean} [connected=false] - Connection status flag.
 * @property {boolean} [enabled=true] - Toggle flag for Telegram delivery.
 * @property {string|null} [botToken=null] - Telegram bot API token (select: false).
 * @property {string|null} [botUsername=null] - Telegram bot public username.
 * @property {string|null} [managementChatId=null] - Chat ID for management notifications.
 * @property {string|null} [maintenanceChatId=null] - Chat ID for maintenance notifications.
 * @property {string|null} [generalChatId=null] - Chat ID for general notifications.
 * @property {'text'|'card'|'both'} [defaultFormat='card'] - Default delivery message format.
 * @property {Record<string, any>} [imageCardOptions={}] - Rendering options for image-card delivery.
 * @property {Date|null} [connectedAt=null] - Connection establishment timestamp.
 */

/**
 * @typedef {Object} IUserCloudinary
 * @property {boolean} [connected=false] - Connection status flag.
 * @property {boolean} [enabled=true] - Toggle flag for Cloudinary delivery.
 * @property {string|null} [cloudName=null] - Cloudinary cloud identifier.
 * @property {string|null} [apiKey=null] - Cloudinary API key (select: false).
 * @property {string|null} [apiSecret=null] - Cloudinary API secret (select: false).
 * @property {string} [folderPrefix='operon-v1'] - Root asset folder prefix in Cloudinary storage.
 * @property {Date|null} [connectedAt=null] - Connection establishment timestamp.
 */

/**
 * @typedef {Object} IUserIntegrations
 * @property {IUserGoogleDrive} [googleDrive] - Google Drive export and backup configuration.
 * @property {IUserTelegram} [telegram] - Telegram bot notifications and report dispatch.
 * @property {IUserCloudinary} [cloudinary] - BYO Cloudinary media storage credentials.
 */

/**
 * @typedef {Object} IUser
 * @property {import('mongoose').Types.ObjectId} _id - Unique user account identifier.
 * @property {string} firstName - User first name (2-50 chars).
 * @property {string} lastName - User last name (2-50 chars).
 * @property {string} email - Unique lowercase email address.
 * @property {string} [password] - Bcrypt hashed password (select: false).
 * @property {'local'|'google'|'both'} authProvider - Active authentication provider method.
 * @property {boolean} isPasswordSet - Flag indicating whether local password authentication is active.
 * @property {import('mongoose').Types.ObjectId|null} [avatar=null] - Reference to profile avatar in Asset collection.
 * @property {string} [position=''] - Optional professional position description.
 * @property {IUserSettings} settings - User operational settings, directives, STT, and API keys.
 * @property {IUserIntegrations} integrations - External service connector credentials and options.
 * @property {string} [fullName] - Virtual property combining first and last name.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Checks whether a candidate value is a non-empty string.
 * @param {any} value - Value to check.
 * @returns {boolean} True if string has non-whitespace characters.
 */
const hasNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Verifies whether a select:false secret field can safely drive persisted presence/connection booleans.
 * Prevents ancestor markModified('settings' | 'integrations') calls from corrupting unselected DB booleans to false.
 * @param {import('mongoose').Document} doc - Document instance.
 * @param {string} dotPath - Path to test.
 * @param {any} value - Current value.
 * @returns {boolean} True if field can be trusted.
 */
const canTrustSecretField = (doc, dotPath, value) =>
  hasNonEmptyString(value) || doc.isSelected(dotPath) || doc.isDirectModified(dotPath);

/**
 * Synchronizes a credential-backed boolean status flag safely across new docs, unselected partial saves,
 * direct boolean flag spoofing, and container replacement overwrites.
 * @param {object} params - Sync configuration.
 * @param {import('mongoose').Document} params.doc - Document instance.
 * @param {Record<string, any>} params.container - Container object holding credentials.
 * @param {string} params.containerPath - Dot-path to container.
 * @param {string} params.flagKey - Boolean flag property name.
 * @param {Array<{ path: string, value: any }>} [params.requiredFields=[]] - Mandatory credential fields.
 * @param {Array<{ path: string, value: any }>} [params.anyOfFields=[]] - Optional any-of credential fields.
 */
function syncCredentialStatusFlag({
  doc,
  container,
  containerPath,
  flagKey,
  requiredFields = [],
  anyOfFields = [],
}) {
  if (!container) {
    return;
  }
  const flagPath = `${containerPath}.${flagKey}`;
  const containerReplaced = doc.isDirectModified(containerPath);
  const flagSpoofedTrue = doc.isDirectModified(flagPath) && Boolean(container[flagKey]);

  const evalField = ({ path, value }) => ({
    hasValue: hasNonEmptyString(value),
    trusted: canTrustSecretField(doc, path, value) || containerReplaced || doc.isNew,
    modified: doc.isModified(path),
  });

  const fields = requiredFields.length > 0 ? requiredFields : anyOfFields;
  if (fields.length === 0) {
    return;
  }

  const states = fields.map(evalField);
  const shouldCheck =
    doc.isNew ||
    containerReplaced ||
    flagSpoofedTrue ||
    states.some((s) => s.modified && s.trusted);

  if (!shouldCheck) {
    return;
  }

  if (requiredFields.length > 0) {
    if (states.every((s) => s.hasValue)) {
      container[flagKey] = true;
    } else if (flagSpoofedTrue || states.some((s) => s.trusted && !s.hasValue)) {
      container[flagKey] = false;
    }
    return;
  }

  if (states.some((s) => s.hasValue)) {
    container[flagKey] = true;
  } else if (flagSpoofedTrue || states.every((s) => s.trusted && !s.hasValue)) {
    container[flagKey] = false;
  }
}

/**
 * Returns allowed models for a specific AI provider.
 * @param {string} provider - Provider name ('google', 'addis_ai').
 * @returns {Array<string>} List of supported models.
 */
const getAllowedModelsForProvider = (provider) =>
  typeof provider === 'string' && Object.hasOwn(AI_MODELS.BY_PROVIDER, provider)
    ? AI_MODELS.BY_PROVIDER[provider]
    : [];

/**
 * Returns the default model for a specific AI provider.
 * @param {string} provider - Provider name.
 * @returns {string|undefined} Default model identifier.
 */
const getDefaultModelForProvider = (provider) =>
  typeof provider === 'string' && Object.hasOwn(AI_MODELS.DEFAULT_BY_PROVIDER, provider)
    ? AI_MODELS.DEFAULT_BY_PROVIDER[provider]
    : undefined;

/**
 * Locates the innermost container object and key holding a dotPath (supports dotted, nested, and mixed partial keys).
 * @param {Record<string, any>} container - Root or nested object.
 * @param {string} dotPath - Dotted path string.
 * @returns {{ target: Record<string, any>, key: string, value: any }|null} Location result.
 */
function findPathLocation(container, dotPath) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(container, dotPath)) {
    return { target: container, key: dotPath, value: container[dotPath] };
  }
  const parts = dotPath.split('.');
  for (let split = parts.length - 1; split >= 1; split -= 1) {
    const prefix = parts.slice(0, split).join('.');
    if (Object.prototype.hasOwnProperty.call(container, prefix)) {
      return findPathLocation(container[prefix], parts.slice(split).join('.'));
    }
  }
  return null;
}

/**
 * Extracts a value from an object using a dotted path.
 * @param {Record<string, any>} container - Object to traverse.
 * @param {string} dotPath - Dotted path.
 * @returns {any} Value at path or undefined.
 */
const extractObjectPath = (container, dotPath) => findPathLocation(container, dotPath)?.value;

/**
 * Extracts an updated field value from Mongoose query update operators ($set, $setOnInsert, or direct keys).
 * @param {Record<string, any>} update - Query update payload.
 * @param {string} dotPath - Target path.
 * @returns {any} Resolved update value.
 */
function resolveUpdateField(update, dotPath) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return undefined;
  }
  for (const layer of [update.$set, update.$setOnInsert, update]) {
    const value = extractObjectPath(layer, dotPath);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Determines whether candidatePath equals, is an ancestor of, or is a descendant of dotPath.
 * @param {string} candidatePath - Path to test.
 * @param {string} dotPath - Reference path.
 * @returns {boolean} True if paths touch.
 */
const pathTouchesTarget = (candidatePath, dotPath) =>
  candidatePath === dotPath ||
  dotPath.startsWith(`${candidatePath}.`) ||
  candidatePath.startsWith(`${dotPath}.`);

/**
 * Checks whether an operator layer touches dotPath, an ancestor prefix, or a descendant path (prevents MongoDB WriteError 40).
 * @param {Record<string, any>} layer - Object layer to inspect.
 * @param {string} dotPath - Target path.
 * @returns {boolean} True if a conflict exists.
 */
function hasLayerPathConflict(layer, dotPath) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    return false;
  }
  return Object.keys(layer).some((key) => pathTouchesTarget(key, dotPath));
}

/**
 * Shared sanitizing serializer for both toJSON and toObject transforms.
 * Strips password hash, version key, and unselected/sensitive credential fields,
 * producing sanitized connection status flags.
 *
 * @param {import('mongoose').Document} doc - Source Mongoose document.
 * @param {Record<string, any>} ret - Plain JavaScript transformed object.
 * @returns {Record<string, any>} Sanitized user object.
 */
function sanitizeUserTransform(doc, ret) {
  delete ret.__v;
  delete ret.id;
  delete ret.password;

  if (ret.integrations?.googleDrive) {
    delete ret.integrations.googleDrive.accessToken;
    delete ret.integrations.googleDrive.refreshToken;
    delete ret.integrations.googleDrive.expiryDate;
  }

  if (ret.integrations?.telegram) {
    delete ret.integrations.telegram.botToken;
  }

  if (ret.integrations?.cloudinary) {
    delete ret.integrations.cloudinary.apiKey;
    delete ret.integrations.cloudinary.apiSecret;
  }

  if (ret.settings?.apiKeys) {
    const geminiSelected = Boolean(doc?.isSelected?.('settings.apiKeys.geminiApiKey'));
    const addisSelected = Boolean(doc?.isSelected?.('settings.apiKeys.addisApiKey'));
    const rawGemini = ret.settings.apiKeys.geminiApiKey;
    const rawAddis = ret.settings.apiKeys.addisApiKey;

    delete ret.settings.apiKeys.geminiApiKey;
    delete ret.settings.apiKeys.addisApiKey;

    if (geminiSelected || hasNonEmptyString(rawGemini)) {
      ret.settings.apiKeys.hasGeminiKey = hasNonEmptyString(rawGemini);
    } else if ('hasGeminiKey' in ret.settings.apiKeys) {
      ret.settings.apiKeys.hasGeminiKey = Boolean(ret.settings.apiKeys.hasGeminiKey);
    }

    if (addisSelected || hasNonEmptyString(rawAddis)) {
      ret.settings.apiKeys.hasAddisKey = hasNonEmptyString(rawAddis);
    } else if ('hasAddisKey' in ret.settings.apiKeys) {
      ret.settings.apiKeys.hasAddisKey = Boolean(ret.settings.apiKeys.hasAddisKey);
    }
  }

  return ret;
}

/**
 * Root Mongoose schema definition for the User model.
 * Enforces single-user account identity, preferences, directives SSOT,
 * and encrypted BYOK credentials.
 */
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required.'],
      trim: true,
      minlength: [
        USER_NAME_LENGTH.MIN,
        `First name must be at least ${USER_NAME_LENGTH.MIN} characters.`,
      ],
      maxlength: [
        USER_NAME_LENGTH.MAX,
        `First name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`,
      ],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required.'],
      trim: true,
      minlength: [
        USER_NAME_LENGTH.MIN,
        `Last name must be at least ${USER_NAME_LENGTH.MIN} characters.`,
      ],
      maxlength: [
        USER_NAME_LENGTH.MAX,
        `Last name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`,
      ],
    },
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address.'],
    },
    password: {
      type: String,
      select: false,
      set: (value) => (value === '' ? undefined : value),
      minlength: [
        PASSWORD_MIN_LENGTH,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
      ],
      required: function () {
        return this.authProvider === AUTH_CONSTANTS.LOCAL || Boolean(this.isPasswordSet);
      },
    },
    authProvider: {
      type: String,
      enum: AUTH_CONSTANTS.PROVIDERS,
      default: AUTH_CONSTANTS.DEFAULT_PROVIDER,
    },
    isPasswordSet: {
      type: Boolean,
      default: function () {
        return this.authProvider !== AUTH_CONSTANTS.GOOGLE;
      },
    },
    avatar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
    },
    position: {
      type: String,
      trim: true,
      default: DEFAULT_POSITION,
      maxlength: [
        USER_POSITION_LENGTH.MAX,
        `Position cannot exceed ${USER_POSITION_LENGTH.MAX} characters.`,
      ],
    },
    settings: {
      sttEngine: {
        type: String,
        enum: CHAT_CONSTANTS.STT_ENGINES,
        default: CHAT_CONSTANTS.DEFAULT_STT_ENGINE,
      },
      agentConfig: {
        persona: {
          type: String,
          default: CHAT_CONSTANTS.DEFAULT_PERSONA,
          trim: true,
          maxlength: [
            CHAT_CONSTANTS.PERSONA_MAX_LENGTH,
            `Persona cannot exceed ${CHAT_CONSTANTS.PERSONA_MAX_LENGTH} characters.`,
          ],
        },
        defaultProvider: {
          type: String,
          enum: CHAT_CONSTANTS.PROVIDERS,
          default: CHAT_CONSTANTS.DEFAULT_PROVIDER,
        },
        defaultModel: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
          default: function () {
            const provider = this?.settings?.agentConfig?.defaultProvider || AI_PROVIDERS.DEFAULT;
            return getDefaultModelForProvider(provider) || AI_MODELS.DEFAULT;
          },
          trim: true,
          validate: {
            validator: function (value) {
              let provider;
              if (typeof this?.getUpdate === 'function') {
                provider = resolveUpdateField(
                  this.getUpdate(),
                  'settings.agentConfig.defaultProvider'
                );
                if (provider === undefined) {
                  const filterProvider = extractObjectPath(
                    this.getFilter?.(),
                    'settings.agentConfig.defaultProvider'
                  );
                  provider = typeof filterProvider === 'string' ? filterProvider : undefined;
                }
                if (provider === undefined) {
                  return true;
                }
              } else if (!this) {
                return true;
              } else {
                provider = this.settings?.agentConfig?.defaultProvider || AI_PROVIDERS.DEFAULT;
              }
              return getAllowedModelsForProvider(provider).includes(value);
            },
            message: 'Default model is incompatible with the selected default provider.',
          },
        },
        defaultThinkingBudget: {
          type: Number,
          default: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
          min: [
            CHAT_CONSTANTS.MIN_THINKING_BUDGET,
            `Thinking budget cannot be less than ${CHAT_CONSTANTS.MIN_THINKING_BUDGET}.`,
          ],
          max: [
            CHAT_CONSTANTS.MAX_THINKING_BUDGET,
            `Thinking budget cannot exceed ${CHAT_CONSTANTS.MAX_THINKING_BUDGET} tokens.`,
          ],
          validate: {
            validator: Number.isInteger,
            message: 'Thinking budget must be an integer token count.',
          },
        },
        defaultTemperature: {
          type: Number,
          default: CHAT_CONSTANTS.DEFAULT_TEMPERATURE,
          min: [
            CHAT_CONSTANTS.MIN_TEMPERATURE,
            `Temperature cannot be lower than ${CHAT_CONSTANTS.MIN_TEMPERATURE}.`,
          ],
          max: [
            CHAT_CONSTANTS.MAX_TEMPERATURE,
            `Temperature cannot exceed ${CHAT_CONSTANTS.MAX_TEMPERATURE}.`,
          ],
        },
        defaultLanguage: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_LANGUAGES,
          default: CHAT_CONSTANTS.DEFAULT_LANGUAGE,
        },
      },
      tts: {
        amharicVoice: {
          type: String,
          default: TTS_CONSTANTS.DEFAULT_AMHARIC_VOICE,
          trim: true,
        },
        englishVoice: {
          type: String,
          default: TTS_CONSTANTS.DEFAULT_ENGLISH_VOICE,
          trim: true,
        },
        speed: {
          type: Number,
          default: TTS_CONSTANTS.DEFAULT_SPEED,
          min: [
            TTS_CONSTANTS.MIN_SPEED,
            `Speech speed must be at least ${TTS_CONSTANTS.MIN_SPEED}.`,
          ],
          max: [
            TTS_CONSTANTS.MAX_SPEED,
            `Speech speed cannot exceed ${TTS_CONSTANTS.MAX_SPEED}.`,
          ],
        },
        autoPlay: {
          type: Boolean,
          default: TTS_CONSTANTS.DEFAULT_AUTO_PLAY,
        },
      },
      directives: {
        negativeVocabulary: [
          {
            type: String,
            trim: true,
          },
        ],
        phraseMappings: {
          type: Map,
          of: String,
          default: () => new Map(),
        },
        userInstructions: [
          {
            type: String,
            trim: true,
          },
        ],
      },
      apiKeys: {
        hasGeminiKey: {
          type: Boolean,
          default: false,
        },
        hasAddisKey: {
          type: Boolean,
          default: false,
        },
        geminiApiKey: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        addisApiKey: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
      },
      reportTemplates: {
        singleBranch: {
          type: String,
          default: REPORT_CONSTANTS.DEFAULT_SINGLE_BRANCH_TEMPLATE,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Single branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
        multiBranch: {
          type: String,
          default: REPORT_CONSTANTS.DEFAULT_MULTI_BRANCH_TEMPLATE,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Multi branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
      },
    },
    integrations: {
      googleDrive: {
        connected: {
          type: Boolean,
          default: false,
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        email: {
          type: String,
          default: null,
          trim: true,
        },
        accessToken: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        refreshToken: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        expiryDate: {
          type: Number,
          default: null,
          select: false,
        },
        scope: [
          {
            type: String,
            trim: true,
          },
        ],
        rootFolderId: {
          type: String,
          default: null,
          trim: true,
        },
        connectedAt: {
          type: Date,
          default: null,
        },
      },
      telegram: {
        connected: {
          type: Boolean,
          default: false,
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        botToken: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        botUsername: {
          type: String,
          default: null,
          trim: true,
        },
        managementChatId: {
          type: String,
          default: null,
          trim: true,
        },
        maintenanceChatId: {
          type: String,
          default: null,
          trim: true,
        },
        generalChatId: {
          type: String,
          default: null,
          trim: true,
        },
        defaultFormat: {
          type: String,
          enum: TELEGRAM_CONSTANTS.FORMATS,
          default: TELEGRAM_CONSTANTS.DEFAULT_FORMAT,
        },
        imageCardOptions: {
          type: mongoose.Schema.Types.Mixed,
          default: () => ({}),
        },
        connectedAt: {
          type: Date,
          default: null,
        },
      },
      cloudinary: {
        connected: {
          type: Boolean,
          default: false,
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        cloudName: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            CLOUDINARY_CONSTANTS.CLOUD_NAME_MAX_LENGTH,
            `Cloudinary cloud name cannot exceed ${CLOUDINARY_CONSTANTS.CLOUD_NAME_MAX_LENGTH} characters.`,
          ],
        },
        apiKey: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        apiSecret: {
          type: String,
          default: null,
          trim: true,
          select: false,
        },
        folderPrefix: {
          type: String,
          default: CLOUDINARY_CONSTANTS.DEFAULT_FOLDER_PREFIX,
          trim: true,
          maxlength: [
            CLOUDINARY_CONSTANTS.FOLDER_PREFIX_MAX_LENGTH,
            `Cloudinary folder prefix cannot exceed ${CLOUDINARY_CONSTANTS.FOLDER_PREFIX_MAX_LENGTH} characters.`,
          ],
        },
        connectedAt: {
          type: Date,
          default: null,
        },
      },
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      virtuals: true,
      transform: sanitizeUserTransform,
    },
    toObject: {
      virtuals: true,
      transform: sanitizeUserTransform,
    },
  }
);


userSchema.index({ email: 1 }, { unique: true });

/**
 * Derived virtual getter: fullName
 * Combines firstName and lastName into a single trimmed string.
 *
 * @memberof userSchema
 * @returns {string|undefined} Full formatted name or undefined if both names are missing.
 */
userSchema.virtual('fullName').get(function () {
  const name = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  return name || undefined;
});

/**
 * Document Pre-validation Middleware:
 * Synchronizes defaultModel when defaultProvider changes on an existing document or when
 * agentConfig omits defaultModel.
 */
userSchema.pre('validate', function () {
  const config = this.settings?.agentConfig;
  if (!config) {
    return;
  }
  const provider = config.defaultProvider || AI_PROVIDERS.DEFAULT;
  const allowedModels = getAllowedModelsForProvider(provider);
  const defaultModelForProvider =
    getDefaultModelForProvider(provider) || AI_MODELS.DEFAULT;

  if (!config.defaultModel) {
    config.defaultModel = defaultModelForProvider;
    return;
  }

  if (
    !this.isNew &&
    this.isModified('settings.agentConfig.defaultProvider') &&
    !this.isDirectModified('settings.agentConfig.defaultModel') &&
    !this.isDirectModified('settings.agentConfig') &&
    !allowedModels.includes(config.defaultModel)
  ) {
    config.defaultModel = defaultModelForProvider;
  }
});

/**
 * Query Pre-update Middleware:
 * Synchronizes defaultModel on query updates that switch defaultProvider without explicitly
 * specifying defaultModel (conflict-free across all MongoDB $-operators).
 */
userSchema.pre(['findOneAndUpdate', 'updateOne'], function () {
  const update = this.getUpdate();
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return;
  }
  const providerPath = 'settings.agentConfig.defaultProvider';
  const modelPath = 'settings.agentConfig.defaultModel';

  if (resolveUpdateField(update, modelPath) !== undefined) {
    return;
  }

  const operatorEntries = Object.entries(update).filter(([key]) => key.startsWith('$'));

  for (const layer of [update.$set, update.$setOnInsert, update]) {
    const found = findPathLocation(layer, providerPath);
    if (!found) {
      continue;
    }
    const syncedModel = getDefaultModelForProvider(found.value);
    if (!syncedModel) {
      return;
    }
    const modelKey = found.key.replace(/defaultProvider$/, 'defaultModel');
    const hasOperatorConflict = operatorEntries.some(([op, opLayer]) => {
      if (opLayer !== layer && hasLayerPathConflict(opLayer, modelPath)) {
        return true;
      }
      return (
        op === '$rename' &&
        opLayer &&
        typeof opLayer === 'object' &&
        Object.values(opLayer).some(
          (dst) => typeof dst === 'string' && pathTouchesTarget(dst, modelPath)
        )
      );
    });
    const hasRootConflict =
      layer !== update &&
      Object.keys(update).some((key) => !key.startsWith('$') && pathTouchesTarget(key, modelPath));
    if (
      hasOperatorConflict ||
      hasRootConflict ||
      hasLayerPathConflict(found.target, modelKey)
    ) {
      return;
    }
    found.target[modelKey] = syncedModel;
    return;
  }
});

/**
 * Pre-save Middleware:
 * Hashes password on modification with bcrypt salt rounds, marks password active,
 * and upgrades pure Google SSO accounts to 'both' when setting a local password.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
  this.isPasswordSet = true;
  if (this.authProvider === AUTH_CONSTANTS.GOOGLE) {
    this.authProvider = AUTH_CONSTANTS.BOTH;
  }
});

/**
 * Pre-save Middleware:
 * Synchronizes BYOK presence booleans and connector statuses safely with markModified,
 * container-replace, and flag-spoof guards.
 */
userSchema.pre('save', function () {
  if (this.settings?.apiKeys) {
    syncCredentialStatusFlag({
      doc: this,
      container: this.settings.apiKeys,
      containerPath: 'settings.apiKeys',
      flagKey: 'hasGeminiKey',
      requiredFields: [
        {
          path: 'settings.apiKeys.geminiApiKey',
          value: this.settings.apiKeys.geminiApiKey,
        },
      ],
    });
    syncCredentialStatusFlag({
      doc: this,
      container: this.settings.apiKeys,
      containerPath: 'settings.apiKeys',
      flagKey: 'hasAddisKey',
      requiredFields: [
        {
          path: 'settings.apiKeys.addisApiKey',
          value: this.settings.apiKeys.addisApiKey,
        },
      ],
    });
  }

  if (this.integrations?.googleDrive) {
    const drive = this.integrations.googleDrive;
    syncCredentialStatusFlag({
      doc: this,
      container: drive,
      containerPath: 'integrations.googleDrive',
      flagKey: 'connected',
      anyOfFields: [
        { path: 'integrations.googleDrive.accessToken', value: drive.accessToken },
        { path: 'integrations.googleDrive.refreshToken', value: drive.refreshToken },
      ],
    });
  }

  if (this.integrations?.telegram) {
    syncCredentialStatusFlag({
      doc: this,
      container: this.integrations.telegram,
      containerPath: 'integrations.telegram',
      flagKey: 'connected',
      requiredFields: [
        {
          path: 'integrations.telegram.botToken',
          value: this.integrations.telegram.botToken,
        },
      ],
    });
  }

  if (this.integrations?.cloudinary) {
    const cloud = this.integrations.cloudinary;
    syncCredentialStatusFlag({
      doc: this,
      container: cloud,
      containerPath: 'integrations.cloudinary',
      flagKey: 'connected',
      requiredFields: [
        { path: 'integrations.cloudinary.cloudName', value: cloud.cloudName },
        { path: 'integrations.cloudinary.apiKey', value: cloud.apiKey },
        { path: 'integrations.cloudinary.apiSecret', value: cloud.apiSecret },
      ],
    });
  }
});

/**
 * Compares a candidate plaintext password against the stored bcrypt hash.
 *
 * @memberof userSchema.methods
 * @param {string} candidatePassword - Plaintext candidate password to verify.
 * @returns {Promise<boolean>} True if password matches hash; false otherwise.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || typeof candidatePassword !== 'string' || !this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Backwards-compatible alias for comparePassword (matching V0 controller calls).
 *
 * @memberof userSchema.methods
 * @param {string} candidatePassword - Plaintext candidate password to verify.
 * @returns {Promise<boolean>} True if password matches hash; false otherwise.
 */
userSchema.methods.matchPassword = userSchema.methods.comparePassword;

/**
 * Authoritative Mongoose Model for User accounts.
 * @type {import('mongoose').Model<IUser>}
 */
export const User = mongoose.model('User', userSchema);
export default User;
