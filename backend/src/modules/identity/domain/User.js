/**
 * @module modules/identity/domain/User
 * @description Mongoose schema and domain model for application User.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import {
  DEFAULT_POSITION,
  USER_NAME_LENGTH,
  PASSWORD_MIN_LENGTH,
  EMAIL_REGEX,
  BCRYPT_SALT_ROUNDS,
  CHAT_CONSTANTS,
} from '../../../utils/constants.js';
import {
  encryptCredential,
  decryptCredential,
  serializeEnvelope,
  redactCredential,
} from '../services/credentialEncryption.js';

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
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address.'],
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
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
      required: [true, 'Position is required.'],
      trim: true,
      default: DEFAULT_POSITION,
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
          default: 'am-ET-Standard-A',
          trim: true,
        },
        englishVoice: {
          type: String,
          default: 'en-US-Standard-C',
          trim: true,
        },
        speed: {
          type: Number,
          default: 1.0,
          min: 0.5,
          max: 2.0,
        },
        autoPlay: {
          type: Boolean,
          default: false,
        },
      },
      directives: {
        negativeVocabulary: [{ type: String, trim: true }],
        phraseMappings: { type: Map, of: String, default: () => new Map() },
        customInstructions: [{ type: String, trim: true }],
      },
      apiKeys: {
        hasGeminiKey: { type: Boolean, default: false },
        hasAddisKey: { type: Boolean, default: false },
        geminiApiKey: { type: String, default: null, trim: true, select: false },
        addisApiKey: { type: String, default: null, trim: true, select: false },
      },
    },
    integrations: {
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
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        delete ret.password;
        if (ret.integrations?.googleDrive) {
          delete ret.integrations.googleDrive.accessToken;
          delete ret.integrations.googleDrive.refreshToken;
          delete ret.integrations.googleDrive.expiryDate;
        }
        if (ret.integrations?.telegram) {
          delete ret.integrations.telegram.botToken;
        }
        if (ret.settings?.apiKeys) {
          const hasGeminiKey =
            ret.settings.apiKeys.geminiApiKey !== undefined
              ? Boolean(ret.settings.apiKeys.geminiApiKey)
              : Boolean(ret.settings.apiKeys.hasGeminiKey);
          const hasAddisKey =
            ret.settings.apiKeys.addisApiKey !== undefined
              ? Boolean(ret.settings.apiKeys.addisApiKey)
              : Boolean(ret.settings.apiKeys.hasAddisKey);
          delete ret.settings.apiKeys.geminiApiKey;
          delete ret.settings.apiKeys.addisApiKey;
          ret.settings.apiKeys.hasGeminiKey = hasGeminiKey;
          ret.settings.apiKeys.hasAddisKey = hasAddisKey;
        }
        return ret;
      },
    },
  }
);

// Virtual property for user's full name
userSchema.virtual('fullName').get(function getFullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save hook for automatic bcrypt password hashing
userSchema.pre('save', async function hashPasswordBeforeSave() {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compares candidate plain-text password with stored bcrypt hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Sets an envelope-encrypted API key or clears it.
 *
 * @param {'geminiApiKey' | 'addisApiKey'} credentialType
 * @param {string | null} plainKey
 */
userSchema.methods.setEncryptedApiKey = function setEncryptedApiKey(credentialType, plainKey) {
  if (!this.settings) this.settings = {};
  if (!this.settings.apiKeys) {
    this.settings.apiKeys = {
      hasGeminiKey: false,
      hasAddisKey: false,
      geminiApiKey: null,
      addisApiKey: null,
    };
  }

  const cleanKey = typeof plainKey === 'string' ? plainKey.trim() : null;
  const flagName = credentialType === 'geminiApiKey' ? 'hasGeminiKey' : credentialType === 'addisApiKey' ? 'hasAddisKey' : null;

  if (cleanKey) {
    const envelope = encryptCredential(cleanKey, {
      userId: this._id.toString(),
      credentialType,
    });
    this.settings.apiKeys[credentialType] = serializeEnvelope(envelope);
    if (flagName) this.settings.apiKeys[flagName] = true;
  } else {
    this.settings.apiKeys[credentialType] = null;
    if (flagName) this.settings.apiKeys[flagName] = false;
  }
};

/**
 * Decrypts and retrieves an envelope-encrypted API key in volatile memory.
 *
 * @param {'geminiApiKey' | 'addisApiKey'} credentialType
 * @returns {string | null} Plaintext API key or null if unset
 */
userSchema.methods.getDecryptedApiKey = function getDecryptedApiKey(credentialType) {
  const serialized = this.settings?.apiKeys?.[credentialType];
  if (!serialized) return null;
  return decryptCredential(serialized, {
    userId: this._id.toString(),
    credentialType,
  });
};

/**
 * Retrieves a redacted string representation of an API key for safe user display.
 *
 * @param {'geminiApiKey' | 'addisApiKey'} credentialType
 * @returns {string} Redacted key (e.g. "sk-a...7890") or "Not Set"
 */
userSchema.methods.getRedactedApiKey = function getRedactedApiKey(credentialType) {
  const plain = this.getDecryptedApiKey(credentialType);
  return redactCredential(plain);
};

export const User = mongoose.model('User', userSchema);
export default User;
