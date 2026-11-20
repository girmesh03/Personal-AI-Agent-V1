/**
 * @module models/Report
 * @description Mongoose model for corporate operational shift inspection dossiers.
 * Scoped strictly to the authenticated user (Protocol 21).
 * Enforces dual-calendar uniqueness (Gregorian YYYY-MM-DD + Ethiopian DD-MM-YY),
 * shift work hours (HH:mm), branch visit intervals, structured checklists,
 * and universal multimodal asset attachments (file, image, audio) with standard pagination.
 * Strictly adheres to Protocol 20 & 36 (comprehensive JSDoc), Protocol 21 (user isolation),
 * Protocol 43 (cloud media storage exclusivity), Protocol 48 (text extraction),
 * Protocol 54 (dual-calendar temporal authority), Protocol 55 (pristine asset preservation),
 * Protocol 65 (universal user terminology), and Protocol 71 (type contracts).
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { REPORT_CONSTANTS } from '../utils/constants.js';
import { toEthiopianDateString } from '../utils/ethiopianCalendar.js';

/**
 * @typedef {object} IReportVisit
 * @property {import('mongoose').Types.ObjectId} branch - Inspected branch identifier.
 * @property {string} [clockIn] - Visit arrival time in HH:mm format.
 * @property {string} [clockOut] - Visit departure time in HH:mm format.
 */

/**
 * @typedef {object} IReportActivity
 * @property {string} text - Description of the completed or scheduled operational task.
 * @property {'completed'|'in_progress'|'pending'} status - Execution status of the activity.
 */

/**
 * @typedef {object} IReportIssue
 * @property {string} text - Description of the operational issue or equipment defect.
 * @property {'reported'|'in_progress'|'resolved'} status - Triage status of the issue.
 */

/**
 * @typedef {object} IReportComment
 * @property {string} text - Supervisory feedback or management observation text.
 */

/**
 * @typedef {object} IReport
 * @property {import('mongoose').Types.ObjectId} _id - Unique report identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning user identifier (Protocol 21 user isolation).
 * @property {Date} date - Canonical UTC inspection date.
 * @property {string} dateString - Normalized Gregorian date string in YYYY-MM-DD format.
 * @property {string} ethiopianDate - Normalized Ethiopian date string in DD-MM-YY format.
 * @property {string} clockIn - Overall shift start time in HH:mm format.
 * @property {string} clockOut - Overall shift end time in HH:mm format.
 * @property {string} transcription - Authoritative Amharic operational text dossier (SSOT narrative).
 * @property {IReportVisit[]} visits - Physical branch visits inspected during shift.
 * @property {IReportActivity[]} activities - Structured operational tasks executed.
 * @property {IReportIssue[]} issues - Structured operational issues or defects reported.
 * @property {IReportComment[]} comments - Qualitative supervisory feedback notes.
 * @property {import('mongoose').Types.ObjectId[]} assets - Relational references to evidentiary assets (file, image, audio).
 * @property {Record<string, any>} metadata - Extensible operational metadata.
 * @property {boolean} isArchived - Soft-deletion archival flag.
 * @property {Date|null} archivedAt - Timestamp when report was soft-archived.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Mongoose schema definition for the Report collection.
 * @type {import('mongoose').Schema<IReport>}
 */
const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required.'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Inspection date is required.'],
      index: true,
    },
    dateString: {
      type: String,
      required: [true, 'Normalized Gregorian date string (YYYY-MM-DD) is required.'],
      trim: true,
      index: true,
    },
    ethiopianDate: {
      type: String,
      required: [true, 'Normalized Ethiopian date string (DD-MM-YY) is required.'],
      trim: true,
      index: true,
    },
    clockIn: {
      type: String,
      required: [true, 'Work clock-in time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-in time must be in HH:mm format.'],
    },
    clockOut: {
      type: String,
      required: [true, 'Work clock-out time is required.'],
      trim: true,
      match: [REPORT_CONSTANTS.TIME_REGEX, 'Work clock-out time must be in HH:mm format.'],
    },
    transcription: {
      type: String,
      required: [true, 'Report transcription is required.'],
      trim: true,
      maxlength: [
        REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH,
        `Transcription text cannot exceed ${REPORT_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`,
      ],
    },
    visits: {
      type: [
        {
          _id: false,
          branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Branch',
            required: [true, 'Branch reference is required for each visit.'],
          },
          clockIn: {
            type: String,
            trim: true,
            match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit arrival time must be in HH:mm format.'],
          },
          clockOut: {
            type: String,
            trim: true,
            match: [REPORT_CONSTANTS.TIME_REGEX, 'Visit departure time must be in HH:mm format.'],
          },
        },
      ],
      default: [],
    },
    activities: {
      type: [
        {
          _id: false,
          text: {
            type: String,
            required: [true, 'Activity text is required.'],
            trim: true,
            maxlength: [
              REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH,
              `Activity text cannot exceed ${REPORT_CONSTANTS.ACTIVITY_TEXT_MAX_LENGTH} characters.`,
            ],
          },
          status: {
            type: String,
            enum: {
              values: REPORT_CONSTANTS.ACTIVITY_STATUSES,
              message: 'Activity status `{VALUE}` is not supported.',
            },
            default: REPORT_CONSTANTS.DEFAULT_ACTIVITY_STATUS,
          },
        },
      ],
      default: [],
    },
    issues: {
      type: [
        {
          _id: false,
          text: {
            type: String,
            required: [true, 'Issue text is required.'],
            trim: true,
            maxlength: [
              REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH,
              `Issue text cannot exceed ${REPORT_CONSTANTS.ISSUE_TEXT_MAX_LENGTH} characters.`,
            ],
          },
          status: {
            type: String,
            enum: {
              values: REPORT_CONSTANTS.ISSUE_STATUSES,
              message: 'Issue status `{VALUE}` is not supported.',
            },
            default: REPORT_CONSTANTS.DEFAULT_ISSUE_STATUS,
          },
        },
      ],
      default: [],
    },
    comments: {
      type: [
        {
          _id: false,
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
      default: [],
    },
    assets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Asset',
        },
      ],
      default: [],
      validate: [
        (val) => !val || (Array.isArray(val) && val.length <= REPORT_CONSTANTS.MAX_ASSETS),
        `Report assets cannot exceed ${REPORT_CONSTANTS.MAX_ASSETS}.`,
      ],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
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

/**
 * Pre-validation hook:
 * Automatically computes and populates dateString (YYYY-MM-DD) and ethiopianDate (DD-MM-YY)
 * from the date field if not explicitly provided or when date is modified, guaranteeing consistent normalization.
 */
reportSchema.pre('validate', function () {
  if (this.date) {
    const d = new Date(this.date);
    if (!Number.isNaN(d.getTime())) {
      if (!this.dateString || (!this.isNew && this.isModified('date'))) {
        this.dateString = d.toISOString().split('T')[0];
      }
      if (!this.ethiopianDate || (!this.isNew && this.isModified('date'))) {
        this.ethiopianDate = toEthiopianDateString(this.date);
      }
    }
  }
});

// Partial compound unique index: Exactly ONE active report per user per Gregorian date
reportSchema.index(
  { user: 1, dateString: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false, dateString: { $type: 'string' } },
  }
);

// Partial compound unique index: Exactly ONE active report per user per Ethiopian date
reportSchema.index(
  { user: 1, ethiopianDate: 1 },
  {
    unique: true,
    partialFilterExpression: { isArchived: false, ethiopianDate: { $type: 'string' } },
  }
);

// Partial compound index for active reports ordered by date (primary query path)
reportSchema.index(
  { user: 1, date: -1 },
  { partialFilterExpression: { isArchived: false } }
);

// Partial compound index for active branch visit historical queries
reportSchema.index(
  { user: 1, 'visits.branch': 1 },
  { partialFilterExpression: { isArchived: false } }
);

// Compound index for querying reports by attached evidentiary assets
reportSchema.index({ user: 1, assets: 1 });

// Partial compound index for archived reports: retention policies and archived list
reportSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);

// Attach pagination plugin for uniform API list envelopes
reportSchema.plugin(mongoosePaginate);

/**
 * Mongoose model instance for the Report collection with pagination support.
 * @type {import('mongoose').PaginateModel<IReport>}
 */
export const Report = mongoose.model('Report', reportSchema);

export default Report;
