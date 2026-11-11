/**
 * @file backend/src/models/Branch.js
 * @module models/Branch
 * @description Operational physical branch model for Operon (Personal AI Agent V1).
 * Represents an authoritative operational facility, store location, or physical branch.
 * 
 * Architectural Invariants:
 * 1. Single-User Isolation: Scoped strictly to the owning supervisor (`user: { type: ObjectId, ref: 'User', required: true }`).
 * 2. Case-Insensitive Unique Naming: Compound partial unique index `{ user: 1, name: 1 }` with collation `{ locale: 'en', strength: 2 }` prevents duplicate branch names per user while active.
 * 3. Uppercase Unique Branch Code: Compound partial unique index `{ user: 1, code: 1 }` guarantees unique branch codes per user while active.
 * 4. Audit Preservation Invariant: Physical branch deletion is blocked (`canDeletePermanently`) whenever active or historical reports reference this branch.
 * 5. Full-Text Search Stemmer Protection: Text index uses `{ default_language: 'none', language_override: 'no_language_override' }` to protect Ethiopic (Amharic) Fidel script.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
} from '../config/schemaOptions.js';
import { BRANCH_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {Object} IBranchLocation
 * @property {string} [city='Addis Ababa'] - Primary municipality / city of the branch.
 * @property {string} [subcity=''] - Administrative municipal subcity or borough.
 * @property {string} [address=''] - Street address, building number, or landmark location.
 * @property {{ latitude: number|null, longitude: number|null }} [gpsCoordinates] - Geographic GPS coordinates.
 */

/**
 * @typedef {Object} IBranch
 * @property {import('mongoose').Types.ObjectId} _id - Unique operational branch identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor User reference.
 * @property {string} name - Branch facility display name.
 * @property {string} code - Uppercase operational branch code (e.g., 'BOLE-01').
 * @property {string[]} [aliases=[]] - Bilingual search aliases for English/Amharic discovery.
 * @property {IBranchLocation} location - Physical location details.
 * @property {string|null} [managerName=null] - Store or facility branch manager name.
 * @property {string|null} [contactPhone=null] - Operational contact telephone number.
 * @property {'active'|'temporarily_closed'|'renovating'|'permanently_closed'} [operationalStatus='active'] - Operational facility status.
 * @property {boolean} [isArchived=false] - Soft-archival lifecycle flag.
 * @property {Date|null} [archivedAt=null] - Archival timestamp.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Sanitizes JSON and Object transformations of Branch documents by stripping internal Mongoose fields.
 *
 * @param {import('mongoose').Document} doc - The active Mongoose document.
 * @param {Record<string, any>} ret - The plain JavaScript object representation to mutate.
 * @returns {Record<string, any>} Sanitized plain object.
 */
function sanitizeBranchTransform(doc, ret) {
  delete ret.id;
  delete ret.__v;
  return ret;
}

/**
 * Embedded subdocument schema for physical branch location and address details.
 * @type {import('mongoose').Schema}
 */
const locationSchema = new mongoose.Schema(
  {
    /** Primary city location (defaults to Addis Ababa). */
    city: {
      type: String,
      default: BRANCH_CONSTANTS.DEFAULT_CITY,
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.CITY_MAX_LENGTH,
        `City cannot exceed ${BRANCH_CONSTANTS.CITY_MAX_LENGTH} characters.`,
      ],
    },
    /** Municipal subcity or borough. */
    subcity: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH,
        `Subcity cannot exceed ${BRANCH_CONSTANTS.SUBCITY_MAX_LENGTH} characters.`,
      ],
    },
    /** Physical street address, landmark, or building number. */
    address: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH,
        `Address cannot exceed ${BRANCH_CONSTANTS.ADDRESS_MAX_LENGTH} characters.`,
      ],
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Mongoose Schema definition for Operational Branches.
 * @type {import('mongoose').Schema}
 */
const branchSchema = new mongoose.Schema(
  {
    /** Supervisor user account ID owning this branch directory record. Immutable. */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owning supervisor user reference is required.'],
      index: true,
      immutable: true,
    },
    /** Primary human-readable operational branch name. Case-insensitively unique per user when active. */
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
    /** Unique operational branch code (e.g. 'BOLE-001', 'SARIS-002'). Normalized to uppercase. */
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
    /** Alternate names, colloquial designations, or Amharic aliases. */
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    /** Geographical and municipal address metadata. */
    location: {
      type: locationSchema,
      default: () => ({}),
      _id: false,
    },
    /** Name of the on-site branch operational manager. */
    managerName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH,
        `Manager name cannot exceed ${BRANCH_CONSTANTS.MANAGER_NAME_MAX_LENGTH} characters.`,
      ],
    },
    /** Contact telephone number for branch operations. */
    contactPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH,
        `Contact phone cannot exceed ${BRANCH_CONSTANTS.CONTACT_PHONE_MAX_LENGTH} characters.`,
      ],
    },
    /** Current operational facility status ('operational', 'temporarily_closed', 'under_renovation'). */
    operationalStatus: {
      type: String,
      enum: {
        values: BRANCH_CONSTANTS.OPERATIONAL_STATUSES,
        message: '{VALUE} is not a valid operational status.',
      },
      default: BRANCH_CONSTANTS.DEFAULT_OPERATIONAL_STATUS,
    },
    /** Soft-archive flag for historical retention. */
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** Timestamp when the branch was soft-archived. */
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      ...BASE_SCHEMA_OPTIONS.toJSON,
      transform: sanitizeBranchTransform,
    },
    toObject: {
      ...BASE_SCHEMA_OPTIONS.toObject,
      transform: sanitizeBranchTransform,
    },
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// 1. Case-insensitive unique compound index on active branch name per supervisor
branchSchema.index(
  { user: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
    collation: { locale: 'en', strength: 2 },
  }
);

// 2. Unique compound index on active uppercase branch code per supervisor
branchSchema.index(
  { user: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
  }
);

// 3. User-scoped chronological and archive state listing index
branchSchema.index({ user: 1, isArchived: 1, createdAt: -1 });

// 4. Multilingual full-text search index across name, code, aliases, manager, and location
branchSchema.index(
  {
    user: 1,
    name: 'text',
    code: 'text',
    aliases: 'text',
    managerName: 'text',
    'location.address': 'text',
    'location.subcity': 'text',
  },
  {
    default_language: 'none',
    language_override: 'no_language_override',
    weights: {
      name: 10,
      code: 8,
      aliases: 6,
      managerName: 4,
      'location.address': 2,
      'location.subcity': 2,
    },
  }
);

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

/**
 * Derived virtual getter constructing the comma-separated formatted physical address.
 * @memberof branchSchema
 * @returns {string|undefined} Formatted full address string.
 */
branchSchema.virtual('fullAddress').get(function () {
  if (this.isSelected && !this.isSelected('location') && !this.location) return undefined;
  const parts = [];
  if (this.location?.address) parts.push(this.location.address);
  if (this.location?.subcity) parts.push(this.location.subcity);
  if (this.location?.city) parts.push(this.location.city);
  return parts.length > 0 ? parts.join(', ') : '';
});

/**
 * Derived virtual getter indicating whether the branch is currently active and fully operational.
 * @memberof branchSchema
 * @returns {boolean|undefined} True if unarchived and operational.
 */
branchSchema.virtual('isActive').get(function () {
  if (typeof this.isArchived !== 'boolean') return undefined;
  return !this.isArchived && this.operationalStatus === 'operational';
});

// ---------------------------------------------------------------------------
// Document Hooks
// ---------------------------------------------------------------------------

/**
 * Pre-validation document hook ensuring string trimming, code uppercase normalization,
 * alias deduplication, and archive timestamp maintenance.
 */
branchSchema.pre('validate', function () {
  if (!this.isNew && this.isModified('user')) {
    throw new Error('Branch owner (user) is immutable.');
  }

  if (this.name && typeof this.name === 'string') {
    this.name = this.name.trim();
  }
  if (this.code && typeof this.code === 'string') {
    this.code = this.code.trim().toUpperCase();
  }
  if (this.managerName && typeof this.managerName === 'string') {
    this.managerName = this.managerName.trim();
  }
  if (this.contactPhone && typeof this.contactPhone === 'string') {
    this.contactPhone = this.contactPhone.trim();
  }
  if (this.aliases && Array.isArray(this.aliases)) {
    this.aliases = [...new Set(this.aliases.map((a) => String(a || '').trim()).filter(Boolean))];
  }

  if (this.isModified('isArchived')) {
    if (this.isArchived === true) {
      if (!this.archivedAt) this.archivedAt = new Date();
    } else {
      this.archivedAt = null;
    }
  }
});

/**
 * Evaluates whether an update object touches a specific target field directly or via dot-notation.
 * @param {Record<string, any>} update - The MongoDB update payload.
 * @param {string} targetPath - Path to test for modification.
 * @returns {boolean} True if the update targets the specified path.
 */
function pathTouchesTarget(update, targetPath) {
  if (!update || typeof update !== 'object') return false;
  const targetPrefix = targetPath + '.';
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('$')) {
      if (value && typeof value === 'object') {
        if (key === '$rename') {
          for (const [fromKey, toKey] of Object.entries(value)) {
            if (fromKey === targetPath || fromKey.startsWith(targetPrefix)) return true;
            if (toKey === targetPath || toKey.startsWith(targetPrefix)) return true;
          }
          continue;
        }
        for (const subKey of Object.keys(value)) {
          if (subKey === targetPath || subKey.startsWith(targetPrefix)) return true;
        }
      }
    } else {
      if (key === targetPath || key.startsWith(targetPrefix)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

/**
 * Pre-query hook blocking modification of immutable fields (`user`, `_id`) and normalizing code updates.
 */
branchSchema.pre(['findOneAndUpdate', 'updateOne'], async function () {
  const update = this.getUpdate();
  if (!update) return;

  for (const badField of ['user', '_id']) {
    if (pathTouchesTarget(update, badField)) {
      if (update.$setOnInsert && pathTouchesTarget(update.$setOnInsert, badField)) {
        continue;
      }
      throw new Error(`Cannot modify immutable field "${badField}".`);
    }
  }

  if (update.$set && update.$set.code) {
    update.$set.code = String(update.$set.code).trim().toUpperCase();
  } else if (update.code) {
    update.code = String(update.code).trim().toUpperCase();
  }

  if (update.$set && update.$set.name) update.$set.name = String(update.$set.name).trim();
  if (update.name) update.name = String(update.name).trim();

  if (update.$set && typeof update.$set.isArchived === 'boolean') {
    if (update.$set.isArchived) {
      if (!update.$set.archivedAt) update.$set.archivedAt = new Date();
    } else {
      update.$set.archivedAt = null;
    }
  }
});

/**
 * Pre-deletion hook enforcing audit evidence preservation: blocks physical deletion of any branch
 * if active or historical inspection reports reference that branch ID.
 */
branchSchema.pre(['deleteOne', 'findOneAndDelete'], async function () {
  if (mongoose.models.Report) {
    let userId;
    let branchId;
    let BranchModel;

    if (typeof this.getFilter === 'function') {
      const filter = this.getFilter();
      const branchDoc = await this.model.findOne(filter).select('_id user').lean();
      if (!branchDoc) return;
      userId = branchDoc.user;
      branchId = branchDoc._id;
      BranchModel = this.model;
    } else {
      userId = this.user;
      branchId = this._id;
      BranchModel = this.constructor;
    }

    if (branchId && userId && typeof BranchModel?.canDeletePermanently === 'function') {
      const canDelete = await BranchModel.canDeletePermanently({ userId, branchId });
      if (!canDelete) {
        throw new Error(
          'Cannot delete branch with existing audit reports. Historical reports must be preserved for audit compliance. Archive the branch instead.'
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Model Statics
// ---------------------------------------------------------------------------

/**
 * Builds a query selector resolving an identifier by Mongo ObjectId or uppercase branch code.
 *
 * @memberof branchSchema.statics
 * @param {object} params - Resolution parameters.
 * @param {string} params.identifier - Query identifier to resolve.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @returns {Record<string, any>} Constructed MongoDB query object.
 */
branchSchema.statics.buildIdentifierQuery = function ({ identifier, userId }) {
  const cleanId = String(identifier || '').trim();
  const isMongoId =
    mongoose.Types.ObjectId.isValid(cleanId) &&
    String(new mongoose.Types.ObjectId(cleanId)) === cleanId;

  if (isMongoId) {
    return {
      user: userId,
      _id: cleanId,
    };
  }

  return {
    user: userId,
    code: cleanId.toUpperCase(),
  };
};

/**
 * Resolves an array of mixed identifiers (ObjectIds and branch codes) into an array of verified ObjectIds.
 *
 * @memberof branchSchema.statics
 * @param {object} params - Resolution parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @param {Array<string|import('mongoose').Types.ObjectId>} params.identifiers - List of mixed branch identifiers.
 * @param {import('mongoose').ClientSession|null} [params.session=null] - Optional ACID session.
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>} Array of resolved branch ObjectIds.
 */
branchSchema.statics.resolveBranchIdentifiers = async function ({
  userId,
  identifiers,
  session = null,
}) {
  if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) return [];
  const pendingIds = [];
  const pendingCodes = [];

  for (const item of identifiers) {
    const clean = String(item || '').trim();
    if (
      mongoose.Types.ObjectId.isValid(clean) &&
      String(new mongoose.Types.ObjectId(clean)) === clean
    ) {
      pendingIds.push(new mongoose.Types.ObjectId(clean));
    } else if (clean) {
      pendingCodes.push(clean.toUpperCase());
    }
  }

  const conditions = [];
  if (pendingIds.length > 0) conditions.push({ _id: { $in: pendingIds } });
  if (pendingCodes.length > 0) conditions.push({ code: { $in: pendingCodes } });

  if (conditions.length === 0) return [];

  const found = await this.find(
    {
      user: userId,
      $or: conditions,
    },
    { _id: 1 },
    session ? { session } : {}
  ).lean();

  return found.map((b) => b._id);
};

/**
 * Constructs a structured search query filtering by text keywords, archive state, and operational status.
 *
 * @memberof branchSchema.statics
 * @param {object} params - Search filters.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @param {string} [params.search=''] - Keyword string.
 * @param {boolean} [params.isArchived=false] - Archive status filter.
 * @param {string} [params.operationalStatus] - Operational status filter.
 * @returns {Record<string, any>} Constructed MongoDB query object.
 */
branchSchema.statics.buildSearchQuery = function ({
  userId,
  search = '',
  isArchived = false,
  operationalStatus,
}) {
  const query = { user: userId };
  if (typeof isArchived === 'boolean') {
    query.isArchived = isArchived;
  }
  if (operationalStatus) {
    query.operationalStatus = operationalStatus;
  }
  if (search && typeof search === 'string' && search.trim()) {
    const cleanSearch = search.trim();
    const regex = new RegExp(
      cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    query.$or = [
      { name: regex },
      { code: regex },
      { aliases: regex },
      { managerName: regex },
      { 'location.address': regex },
      { 'location.subcity': regex },
      { 'location.city': regex },
    ];
  }
  return query;
};

/**
 * Checks whether a branch can be safely deleted permanently without violating audit compliance.
 *
 * @memberof branchSchema.statics
 * @param {object} params - Check parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string} params.branchId - Branch ID to test.
 * @param {import('mongoose').ClientSession|null} [params.session=null] - Optional ACID session.
 * @returns {Promise<boolean>} True if no audit reports reference this branch.
 */
branchSchema.statics.canDeletePermanently = async function ({
  userId,
  branchId,
  session = null,
}) {
  if (!mongoose.models.Report) return true;
  const hasReports = await mongoose.models.Report.exists({
    user: userId,
    $or: [
      { branch: branchId },
      { branches: branchId },
      { 'visits.branch': branchId },
      { 'activities.branch': branchId },
      { 'issues.branch': branchId },
    ],
  }).session(session);
  return !hasReports;
};

branchSchema.plugin(mongoosePaginate);

/**
 * Authoritative Mongoose Model for operational physical branches.
 * @type {import('mongoose').Model<IBranch>}
 */
export const Branch = mongoose.model('Branch', branchSchema);
export default Branch;
