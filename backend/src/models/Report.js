/**
 * @file backend/src/models/Report.js
 * @module models/Report
 * @description Operational daily inspection report model for Operon (Personal AI Agent V1).
 * Represents an authoritative operational branch audit conducted on a specific calendar day.
 * 
 * Architectural Invariants:
 * 1. Single Branch Granularity: Each report strictly binds to one physical branch (`branch: { type: ObjectId, ref: 'Branch', required: true }`).
 * 2. Strict Daily Uniqueness: Partial unique compound index `{ user: 1, branch: 1, date: 1 }` where `{ isArchived: false }` enforces exactly one active daily report per branch per supervisor.
 * 3. Zero Subdocuments: Nested collections (`visits`, `activities`, `issues`, `comments`) are defined inline with `{ _id: false }`, eliminating synthetic ID bloat.
 * 4. UTC Midnight Normalization: The `date` field is normalized to UTC midnight (`YYYY-MM-DDT00:00:00.000Z`) during pre-validate and pre-update query hooks.
 * 5. Deterministic Julian Day Number (JDN) Virtuals: Virtual getters `dateString` (YYYY-MM-DD) and `ethiopianDate` (DD-MM-YY) derive dynamically via pure mathematical formulas.
 * 6. Audit Preservation: Hard deletion is blocked unless the report is already archived (`isArchived === true`).
 * 7. Stemmer Protection: Multilingual full-text search index uses `{ default_language: 'none', language_override: 'no_language_override' }` to protect Ethiopic Fidel scripts and prevent `language: null` subfield conflicts.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import { REPORT_CONSTANTS } from '../utils/constants.js';
import {
  toEthiopianDateString,
  parseEthiopianToGregorianDate,
} from '../utils/ethiopianCalendar.js';

/**
 * @typedef {Object} IReportActivity
 * @property {string} text - Operational activity description.
 * @property {'in_progress'|'completed'} [status='completed'] - Activity completion status.
 */

/**
 * @typedef {Object} IReportIssue
 * @property {string} text - Operational problem or blocker description.
 * @property {'reported'|'in_progress'|'completed'|'no_issue'} [status='reported'] - Issue resolution status.
 */

/**
 * @typedef {Object} IReportComment
 * @property {string} text - General supervisory observations and comments.
 */

/**
 * @typedef {Object} IReport
 * @property {import('mongoose').Types.ObjectId} _id - Unique operational report identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor User reference.
 * @property {import('mongoose').Types.ObjectId} branch - Operational physical branch inspected.
 * @property {Date} date - Calendar date of inspection, normalized to UTC midnight.
 * @property {string} clockIn - Shift arrival time in HH:mm format.
 * @property {string} clockOut - Shift departure time in HH:mm format.
 * @property {string|null} [narration=null] - Authoritative corporate Amharic operational narrative text.
 * @property {IReportActivity[]} [activities=[]] - Operational activities performed.
 * @property {IReportIssue[]} [issues=[]] - Operational issues identified.
 * @property {IReportComment[]} [comments=[]] - Supervisory notes and observations.
 * @property {import('mongoose').Types.ObjectId[]} [assets=[]] - Evidentiary Asset references.
 * @property {string} [dateString] - Derived virtual Gregorian date string in YYYY-MM-DD format.
 * @property {string} [ethiopianDate] - Derived virtual Ethiopian calendar date string in DD-MM-YY format.
 * @property {boolean} [isArchived=false] - Soft-archival lifecycle flag.
 * @property {Date|null} [archivedAt=null] - Archival timestamp.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Sanitizes JSON and Object transformations of Report documents by stripping internal Mongoose fields.
 *
 * @param {import('mongoose').Document} doc - The active Mongoose document.
 * @param {Record<string, any>} ret - The plain JavaScript object representation to mutate.
 * @returns {Record<string, any>} Sanitized plain object.
 */
function sanitizeReportTransform(doc, ret) {
  delete ret.id;
  delete ret.__v;
  return ret;
}

/**
 * Mongoose Schema definition for Operational Reports.
 * @type {import('mongoose').Schema}
 */
const reportSchema = new mongoose.Schema(
  {
    /** Supervisor user account ID owning this report. Immutable. */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must belong to a supervisor.'],
      index: true,
      immutable: true,
    },
    /** Physical operational branch facility inspected. */
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Operational branch reference is required.'],
      index: true,
    },
    /** Calendar date of inspection, normalized to UTC midnight. */
    date: {
      type: Date,
      required: [true, 'Inspection date is required.'],
      index: true,
    },
    /** Overall supervisor work shift arrival time in HH:mm format. */
    clockIn: {
      type: String,
      required: [true, 'Work clock-in time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-in time must be in HH:mm format.'],
    },
    /** Overall supervisor work shift departure time in HH:mm format. */
    clockOut: {
      type: String,
      required: [true, 'Work clock-out time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-out time must be in HH:mm format.'],
    },
    /** Sequential physical branch visit time intervals without subdocument IDs. */
    visits: [
      {
        _id: false,
        /** Arrival time for this visit segment (HH:mm). */
        clockIn: {
          type: String,
          required: [true, 'Visit arrival time is required.'],
          trim: true,
          match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit arrival time must be in HH:mm format.'],
        },
        /** Departure time for this visit segment (HH:mm). */
        clockOut: {
          type: String,
          required: [true, 'Visit departure time is required.'],
          trim: true,
          match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit departure time must be in HH:mm format.'],
        },
      },
    ],
    /** Comprehensive narrative text describing branch operational state, hygiene, and audit results. */
    narration: {
      type: String,
      required: [true, 'Report narration is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.NARRATION_MAX_LENGTH,
        `Report narration cannot exceed ${REPORT_CONSTANTS.NARRATION_MAX_LENGTH} characters.`,
      ],
    },
    /** Attached multimodal digital assets (photos, audio notes, receipts) referencing the Asset registry. */
    assets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Asset',
        },
      ],
      default: [],
      validate: {
        validator: function (val) {
          return !val || val.length <= REPORT_CONSTANTS.MAX_ASSETS;
        },
        message: `Report assets cannot exceed ${REPORT_CONSTANTS.MAX_ASSETS} files.`,
      },
    },
    /** Structured operational activities executed during the visit. */
    activities: [
      {
        _id: false,
        /** Activity description text. */
        text: {
          type: String,
          required: [true, 'Activity description is required.'],
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH,
            `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`,
          ],
        },
        /** Operational execution status of the activity. */
        status: {
          type: String,
          enum: {
            values: REPORT_CONSTANTS.ACTIVITY_STATUSES,
            message: '{VALUE} is not a valid activity status.',
          },
          default: REPORT_CONSTANTS.DEFAULT_ACTIVITY_STATUS,
        },
      },
    ],
    /** Operational anomalies, maintenance defects, or compliance issues identified. */
    issues: [
      {
        _id: false,
        /** Issue description text. */
        text: {
          type: String,
          required: [true, 'Issue description is required.'],
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH,
            `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`,
          ],
        },
        /** Remediation status of the issue. */
        status: {
          type: String,
          enum: {
            values: REPORT_CONSTANTS.ISSUE_STATUSES,
            message: '{VALUE} is not a valid issue status.',
          },
          default: REPORT_CONSTANTS.DEFAULT_ISSUE_STATUS,
        },
      },
    ],
    /** Supervisory remarks, follow-up directions, or management notes. */
    comments: [
      {
        _id: false,
        /** Comment text. */
        text: {
          type: String,
          required: [true, 'Comment text is required.'],
          trim: true,
          maxlength: [
            REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH,
            `Comment text cannot exceed ${REPORT_CONSTANTS.COMMENT_TEXT_MAX_LENGTH} characters.`,
          ],
        },
      },
    ],
    /** Soft-archive flag for historical retention and audit preservation. */
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** Timestamp when the report was soft-archived. */
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      ...BASE_SCHEMA_OPTIONS.toJSON,
      transform: sanitizeReportTransform,
    },
    toObject: {
      ...BASE_SCHEMA_OPTIONS.toObject,
      transform: sanitizeReportTransform,
    },
  }
);

/**
 * Derived virtual getter computing the Ethiopian calendar date string (DD-MM-YY)
 * via Julian Day Number conversion.
 * @memberof reportSchema
 * @returns {string|undefined} Formatted Ethiopian date string.
 */
reportSchema.virtual('ethiopianDate').get(function () {
  if (!this.date) return undefined;
  return toEthiopianDateString(this.date);
});

/**
 * Derived virtual getter returning Gregorian date string formatted as YYYY-MM-DD.
 * @memberof reportSchema
 * @returns {string|undefined} Normalized Gregorian date string.
 */
reportSchema.virtual('dateString').get(function () {
  if (!this.date) return undefined;
  return this.date.toISOString().split('T')[0];
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// 1. Authoritative Compound Partial Unique Index: Exactly one active report per branch per day per user
reportSchema.index(
  { user: 1, branch: 1, date: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);

// 2. Fast Chronological Query by Branch
reportSchema.index(
  { user: 1, branch: 1, date: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// 3. User-wide Chronological Query across all branches
reportSchema.index(
  { user: 1, date: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// 4. Archive Lifecycle & 30-day retention query index
reportSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);

// 5. Full-Text Search Index across narration, issues, activities, and comments with Stemmer Isolation
reportSchema.index(
  {
    user: 1,
    narration: 'text',
    'activities.text': 'text',
    'issues.text': 'text',
    'comments.text': 'text',
  },
  {
    default_language: 'none',
    language_override: 'no_language_override',
    weights: {
      narration: 10,
      'issues.text': 5,
      'activities.text': 3,
      'comments.text': 2,
    },
  }
);

// ---------------------------------------------------------------------------
// Document Hooks
// ---------------------------------------------------------------------------

/**
 * Pre-validation document hook ensuring:
 * 1. Immutability of ownership (`user`).
 * 2. Normalization of `date` to UTC midnight.
 * 3. Default visit population from overall shift clockIn/clockOut if visits array is empty.
 * 4. Automatic maintenance of `archivedAt` timestamp.
 */
reportSchema.pre('validate', function () {
  if (!this.isNew && this.isModified('user')) {
    throw new Error('Report owner (user) is immutable.');
  }

  if (this.date) {
    const d = new Date(this.date);
    d.setUTCHours(0, 0, 0, 0);
    this.date = d;
  }

  if (this.visits && this.visits.length === 0 && this.clockIn && this.clockOut) {
    this.visits.push({ clockIn: this.clockIn, clockOut: this.clockOut });
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
 * Pre-query hook blocking modification of immutable fields (`user`, `_id`) and normalizing dates.
 */
reportSchema.pre(['findOneAndUpdate', 'updateOne'], async function () {
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

  if (update.$set && update.$set.date) {
    const d = new Date(update.$set.date);
    d.setUTCHours(0, 0, 0, 0);
    update.$set.date = d;
  }

  if (update.$set && typeof update.$set.isArchived === 'boolean') {
    if (update.$set.isArchived) {
      if (!update.$set.archivedAt) update.$set.archivedAt = new Date();
    } else {
      update.$set.archivedAt = null;
    }
  }
});

// ---------------------------------------------------------------------------
// Model Statics
// ---------------------------------------------------------------------------

/**
 * Builds a query selector resolving an identifier that can be:
 * 1. A valid 24-character hexadecimal MongoDB ObjectId string.
 * 2. A Gregorian date string (YYYY-MM-DD).
 * 3. An Ethiopian date string (DD-MM-YY or DD/MM/YYYY).
 *
 * @memberof reportSchema.statics
 * @param {object} params - Resolution parameters.
 * @param {string} params.identifier - Query identifier to resolve.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string|null} [params.branchId=null] - Optional branch scope.
 * @returns {Record<string, any>} Resolved MongoDB query object.
 */
reportSchema.statics.buildIdentifierQuery = function ({ identifier, userId, branchId = null }) {
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

  const mGreg = cleanId.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mGreg) {
    const d = new Date(
      Date.UTC(parseInt(mGreg[1], 10), parseInt(mGreg[2], 10) - 1, parseInt(mGreg[3], 10), 0, 0, 0, 0)
    );
    const q = { user: userId, date: d };
    if (branchId) q.branch = branchId;
    return q;
  }

  if (typeof parseEthiopianToGregorianDate === 'function') {
    const ethDate = parseEthiopianToGregorianDate(cleanId);
    if (ethDate) {
      const q = { user: userId, date: ethDate };
      if (branchId) q.branch = branchId;
      return q;
    }
  }

  return {
    user: userId,
    _id: cleanId,
  };
};

/**
 * Builds a query filtering reports across a calendar date interval and optional branch.
 *
 * @memberof reportSchema.statics
 * @param {object} params - Date range parameters.
 * @param {import('mongoose').Types.ObjectId|string} params.userId - Authenticated user ID.
 * @param {Date|string|null} [params.startDate=null] - Inclusive start date.
 * @param {Date|string|null} [params.endDate=null] - Inclusive end date.
 * @param {import('mongoose').Types.ObjectId|string|null} [params.branchId=null] - Branch filter.
 * @param {boolean} [params.isArchived=false] - Archive status filter.
 * @returns {Record<string, any>} Constructed MongoDB query object.
 */
reportSchema.statics.buildDateRangeQuery = function ({
  userId,
  startDate,
  endDate,
  branchId = null,
  isArchived = false,
}) {
  const query = { user: userId };
  if (typeof isArchived === 'boolean') {
    query.isArchived = isArchived;
  }
  if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      const d = new Date(startDate);
      d.setUTCHours(0, 0, 0, 0);
      query.date.$gte = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      d.setUTCHours(23, 59, 59, 999);
      query.date.$lte = d;
    }
  }
  if (branchId) {
    query.branch = branchId;
  }
  return query;
};

reportSchema.plugin(mongoosePaginate);

/**
 * Authoritative Mongoose Model for operational daily inspection reports.
 * @type {import('mongoose').Model<IReport>}
 */
export const Report = mongoose.model('Report', reportSchema);
export default Report;
