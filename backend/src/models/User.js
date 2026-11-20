/**
 * @module models/User
 * @description Mongoose schema and model definition for the application User.
 * Enforces single-user operational constraints, AES-256-GCM envelope encryption at rest,
 * and canonical directives naming (Protocol 22, Protocol 37).
 * Serves as parent identity referenced by Chat, Message, and Asset collections (Protocol 21, 58).
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  EMAIL_REGEX,
  BCRYPT_SALT_ROUNDS,
  CHAT_CONSTANTS,
  TTS_CONSTANTS,
  REPORT_CONSTANTS,
} from '../utils/constants.js';
import { encryptSecret } from '../utils/crypto.js';

/**
 * @typedef {object} IUserSettingsDirectives
 * @property {string[]} negativeVocabulary - Forbidden words strictly excluded from all outputs.
 * @property {Map<string, string>} phraseMappings - Shorthand-to-corporate wording and jargon mappings.
 * @property {string[]} userInstructions - Canonical user instructions and behavioral directives (Protocol 37).
 */

/**
 * @typedef {object} IUserSettingsAgentConfig
 * @property {string} persona - Configurable operational persona description.
 * @property {string} defaultProvider - Default AI provider ('google' | 'addis') (Protocol 63).
 * @property {string} defaultModel - Default foundation model identifier (Protocol 28, 63).
 * @property {number} defaultThinkingBudget - Default reasoning token budget.
 * @property {string} defaultLanguage - Default interaction language ('am' | 'en' | 'auto').
 */

/**
 * @typedef {object} IUserSettings
 * @property {string} sttEngine - Default Speech-to-Text engine.
 * @property {IUserSettingsAgentConfig} agentConfig - Agent persona and default reasoning configuration.
 * @property {IUserSettingsDirectives} directives - User vocabulary rules, constraints, and instructions.
 */

/**
 * @typedef {object} IUser
 * @property {import('mongoose').Types.ObjectId} _id - Unique user ID.
 * @property {string} firstName - User first name (2-50 chars).
 * @property {string} lastName - User last name (2-50 chars).
 * @property {string} email - Unique lowercase email address.
 * @property {string} password - Bcrypt hashed password (hidden by default).
 * @property {string} position - Job position (default: empty string '').
 * @property {string|null} avatar - Profile avatar image URL or asset reference placeholder.
 * @property {IUserSettings} settings - User operational settings, STT engine, and directives.
 * @property {string} fullName - Virtual property combining first and last name.
 * @property {Date} createdAt - Timestamp of user creation.
 * @property {Date} updatedAt - Timestamp of last user update.
 */

/**
 * Mongoose schema definition for the User collection.
 * @type {import('mongoose').Schema<IUser>}
 */
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required.'],
      trim: true,
      minlength: [USER_NAME_LENGTH.MIN, `First name must be at least ${USER_NAME_LENGTH.MIN} characters.`],
      maxlength: [USER_NAME_LENGTH.MAX, `First name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required.'],
      trim: true,
      minlength: [USER_NAME_LENGTH.MIN, `Last name must be at least ${USER_NAME_LENGTH.MIN} characters.`],
      maxlength: [USER_NAME_LENGTH.MAX, `Last name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`],
    },
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address.'],
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    password: {
      type: String,
      required: [
        function () {
          return this.authProvider === 'local' || this.isPasswordSet;
        },
        'Password is required.',
      ],
      minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`],
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google', 'both'],
      default: 'local',
    },
    isPasswordSet: {
      type: Boolean,
      default: true,
    },
    position: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    avatarPublicId: {
      type: String,
      default: null,
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
        },
        defaultProvider: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_PROVIDERS,
          default: CHAT_CONSTANTS.DEFAULT_PROVIDER,
        },
        defaultModel: {
          type: String,
          enum: CHAT_CONSTANTS.SUPPORTED_MODELS,
          default: CHAT_CONSTANTS.DEFAULT_MODEL,
        },
        defaultThinkingBudget: {
          type: Number,
          default: CHAT_CONSTANTS.DEFAULT_THINKING_BUDGET,
          min: CHAT_CONSTANTS.MIN_THINKING_BUDGET,
          max: CHAT_CONSTANTS.MAX_THINKING_BUDGET,
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
          min: TTS_CONSTANTS.MIN_SPEED,
          max: TTS_CONSTANTS.MAX_SPEED,
        },
        autoPlay: {
          type: Boolean,
          default: false,
        },
      },
      reportTemplates: {
        singleBranch: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Single branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
        multiBranch: {
          type: String,
          default: null,
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH,
            `Multi branch template cannot exceed ${REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH} characters.`,
          ],
        },
      },
      directives: {
        negativeVocabulary: [{ type: String, trim: true }],
        phraseMappings: { type: Map, of: String, default: () => new Map() },
        userInstructions: [{ type: String, trim: true }],
      },
      apiKeys: {
        hasGeminiKey: { type: Boolean, default: false },
        hasAddisKey: { type: Boolean, default: false },
        geminiApiKey: { type: String, default: null, trim: true, select: false },
        addisApiKey: { type: String, default: null, trim: true, select: false },
      },
    },
    integrations: {
      cloudinary: {
        connected: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        cloudName: { type: String, default: null, trim: true },
        apiKey: { type: String, default: null, trim: true },
        apiSecret: { type: String, default: null, trim: true, select: false },
        connectedAt: { type: Date, default: null },
      },
      googleDrive: {
        connected: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        email: { type: String, default: null },
        accessToken: { type: String, default: null, select: false },
        refreshToken: { type: String, default: null, select: false },
        expiryDate: { type: Number, default: null, select: false },
        scope: [{ type: String }],
        rootFolderId: { type: String, default: null },
        connectedAt: { type: Date, default: null },
      },
      telegram: {
        connected: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true },
        botToken: { type: String, default: null, trim: true, select: false },
        botUsername: { type: String, default: null, trim: true },
        managementChatId: { type: String, default: null, trim: true },
        maintenanceChatId: { type: String, default: null, trim: true },
        generalChatId: { type: String, default: null, trim: true },
        defaultFormat: {
          type: String,
          enum: ['text', 'image'],
          default: 'text',
        },
        imageCardOptions: {
          type: Object,
          default: {},
        },
        connectedAt: { type: Date, default: null },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        delete ret.password;
        if (ret.integrations?.cloudinary) {
          delete ret.integrations.cloudinary.apiSecret;
        }
        if (ret.integrations?.googleDrive) {
          delete ret.integrations.googleDrive.accessToken;
          delete ret.integrations.googleDrive.refreshToken;
          delete ret.integrations.googleDrive.expiryDate;
        }
        if (ret.integrations?.telegram) {
          delete ret.integrations.telegram.botToken;
        }
        if (ret.settings?.apiKeys) {
          const hasGeminiKey = ret.settings.apiKeys.geminiApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.geminiApiKey)
            : Boolean(ret.settings.apiKeys.hasGeminiKey);
          const hasAddisKey = ret.settings.apiKeys.addisApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.addisApiKey)
            : Boolean(ret.settings.apiKeys.hasAddisKey);
          delete ret.settings.apiKeys.geminiApiKey;
          delete ret.settings.apiKeys.addisApiKey;
          ret.settings.apiKeys.hasGeminiKey = hasGeminiKey;
          ret.settings.apiKeys.hasAddisKey = hasAddisKey;
        } else if (ret.settings) {
          ret.settings.apiKeys = {
            hasGeminiKey: false,
            hasAddisKey: false,
          };
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        delete ret.password;
        if (ret.integrations?.cloudinary) {
          delete ret.integrations.cloudinary.apiSecret;
        }
        if (ret.integrations?.googleDrive) {
          delete ret.integrations.googleDrive.accessToken;
          delete ret.integrations.googleDrive.refreshToken;
          delete ret.integrations.googleDrive.expiryDate;
        }
        if (ret.integrations?.telegram) {
          delete ret.integrations.telegram.botToken;
        }
        if (ret.settings?.apiKeys) {
          const hasGeminiKey = ret.settings.apiKeys.geminiApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.geminiApiKey)
            : Boolean(ret.settings.apiKeys.hasGeminiKey);
          const hasAddisKey = ret.settings.apiKeys.addisApiKey !== undefined
            ? Boolean(ret.settings.apiKeys.addisApiKey)
            : Boolean(ret.settings.apiKeys.hasAddisKey);
          delete ret.settings.apiKeys.geminiApiKey;
          delete ret.settings.apiKeys.addisApiKey;
          ret.settings.apiKeys.hasGeminiKey = hasGeminiKey;
          ret.settings.apiKeys.hasAddisKey = hasAddisKey;
        } else if (ret.settings) {
          ret.settings.apiKeys = {
            hasGeminiKey: false,
            hasAddisKey: false,
          };
        }
        return ret;
      },
    },
  }
);

// Explicit schema-level unique index on email
userSchema.index({ email: 1 }, { unique: true });

/**
 * Virtual getter for the user's computed full name.
 * @memberof userSchema
 * @returns {string} Combined first and last name.
 */
userSchema.virtual('fullName').get(function () {
  const name = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  return name || undefined;
});

/**
 * Mongoose pre-save hook to synchronize BYOK status flags and envelope-encrypt secrets (Protocol 22).
 */
userSchema.pre('save', function () {
  if (this.settings?.apiKeys) {
    if (this.isModified('settings.apiKeys.geminiApiKey') && this.settings.apiKeys.geminiApiKey) {
      this.settings.apiKeys.geminiApiKey = encryptSecret(this.settings.apiKeys.geminiApiKey);
      this.settings.apiKeys.hasGeminiKey = true;
    } else if (this.isModified('settings.apiKeys.geminiApiKey')) {
      this.settings.apiKeys.hasGeminiKey = false;
    }

    if (this.isModified('settings.apiKeys.addisApiKey') && this.settings.apiKeys.addisApiKey) {
      this.settings.apiKeys.addisApiKey = encryptSecret(this.settings.apiKeys.addisApiKey);
      this.settings.apiKeys.hasAddisKey = true;
    } else if (this.isModified('settings.apiKeys.addisApiKey')) {
      this.settings.apiKeys.hasAddisKey = false;
    }
  }

  // Envelope-encrypt integration secrets if modified
  if (this.isModified('integrations.cloudinary.apiSecret') && this.integrations?.cloudinary?.apiSecret) {
    this.integrations.cloudinary.apiSecret = encryptSecret(this.integrations.cloudinary.apiSecret);
  }
  if (this.isModified('integrations.telegram.botToken') && this.integrations?.telegram?.botToken) {
    this.integrations.telegram.botToken = encryptSecret(this.integrations.telegram.botToken);
  }
  if (this.isModified('integrations.googleDrive.accessToken') && this.integrations?.googleDrive?.accessToken) {
    this.integrations.googleDrive.accessToken = encryptSecret(this.integrations.googleDrive.accessToken);
  }
  if (this.isModified('integrations.googleDrive.refreshToken') && this.integrations?.googleDrive?.refreshToken) {
    this.integrations.googleDrive.refreshToken = encryptSecret(this.integrations.googleDrive.refreshToken);
  }
});

/**
 * Mongoose pre-save hook to hash user password using bcrypt with salt factor 12.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compares an incoming plain-text password with the stored bcrypt hash.
 * Single canonical password comparison method (zero aliases).
 *
 * @function matchPassword
 * @memberof userSchema.methods
 * @param {string} enteredPassword - Candidate plain-text password.
 * @returns {Promise<boolean>} True if password matches hash, false otherwise.
 */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Mongoose model instance for the User collection.
 * @type {import('mongoose').Model<IUser>}
 */
export const User = mongoose.model('User', userSchema);
export default User;
