/**
 * @module models/Branch
 * @description Mongoose model for physical operational branch locations.
 * Scoped strictly to the authenticated user (Protocol 21).
 * Enforces compound partial unique indexes on (user, name) with case-insensitive collation,
 * operational code uniqueness, bilingual search aliases (aliases),
 * flattened geographic properties (zero subdocuments per Directive 5),
 * soft-archival lifecycle tracking, and standard pagination.
 * Strictly adheres to Protocol 20 & 36 (comprehensive JSDoc), Protocol 21 (user isolation),
 * Protocol 65 (universal user terminology), and Protocol 71 (type contracts).
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BRANCH_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {object} IBranch
 * @property {import('mongoose').Types.ObjectId} _id - Unique branch identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning user identifier (Protocol 21 user isolation).
 * @property {string} name - Branch name (English or Amharic).
 * @property {string} code - Operational branch code (e.g., 'BOLE-01').
 * @property {string[]} aliases - Bilingual phonetic search aliases for Amharic/English discovery.
 * @property {string} city - Municipality / city of the branch (flattened per Directive 5).
 * @property {string} subcity - Administrative subcity / district (flattened per Directive 5).
 * @property {string} address - Physical street address or landmark (flattened per Directive 5).
 * @property {string} managerName - Store manager full name.
 * @property {string} contactPhone - Store manager direct phone number.
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when branch was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Mongoose schema definition for the Branch collection.
 * @type {import('mongoose').Schema<IBranch>}
 */
const branchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required.'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required.'],
      trim: true,
      minlength: [
        BRANCH_CONSTANTS.NAME_MIN_LENGTH,
        `Branch name must be at least ${BRANCH_CONSTANTS.NAME_MIN_LENGTH} character.`,
      ],
      maxlength: [
        BRANCH_CONSTANTS.NAME_MAX_LENGTH,
        `Branch name cannot exceed ${BRANCH_CONSTANTS.NAME_MAX_LENGTH} characters.`,
      ],
    },
    code: {
      type: String,
      required: [true, 'Operational branch code is required.'],
      trim: true,
      uppercase: true,
      minlength: [
        BRANCH_CONSTANTS.CODE_MIN_LENGTH,
        `Branch code must be at least ${BRANCH_CONSTANTS.CODE_MIN_LENGTH} characters.`,
      ],
      maxlength: [
        BRANCH_CONSTANTS.CODE_MAX_LENGTH,
        `Branch code cannot exceed ${BRANCH_CONSTANTS.CODE_MAX_LENGTH} characters.`,
      ],
    },
    aliases: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [
            BRANCH_CONSTANTS.NAME_MAX_LENGTH,
            `Alias cannot exceed ${BRANCH_CONSTANTS.NAME_MAX_LENGTH} characters.`,
          ],
        },
      ],
      default: [],
      index: true,
    },
    city: {
      type: String,
      default: BRANCH_CONSTANTS.DEFAULT_CITY,
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.CITY_MAX_LENGTH,
        `City cannot exceed ${BRANCH_CONSTANTS.CITY_MAX_LENGTH} characters.`,
      ],
    },
    subcity: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH,
        `Subcity cannot exceed ${BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH} characters.`,
      ],
    },
    address: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH,
        `Address cannot exceed ${BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH} characters.`,
      ],
    },
    managerName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH,
        `Manager name cannot exceed ${BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH} characters.`,
      ],
    },
    contactPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH,
        `Contact phone cannot exceed ${BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH} characters.`,
      ],
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
  }
);

// Compound partial unique index with case-insensitive collation:
// Guarantees active branch names are unique per user without requiring redundant normalizedName fields.
branchSchema.index(
  { user: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
    collation: { locale: 'en', strength: 2 },
  }
);

// Compound partial unique index: ensures active branch codes are strictly unique per user.
branchSchema.index(
  { user: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
  }
);

// Compound index for paginated active/archived branch directory queries.
branchSchema.index({ user: 1, isArchived: 1, createdAt: -1 });

// Attach pagination plugin for uniform API list envelopes
branchSchema.plugin(mongoosePaginate);

/**
 * Mongoose model instance for the Branch collection with pagination support.
 * @type {import('mongoose').PaginateModel<IBranch>}
 */
export const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
