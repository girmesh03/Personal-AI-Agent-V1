/**
 * @module modules/assets/persistence/AssetRepresentation
 * @description First-class persistence model for derived multimodal representations and extraction provenance (FR-CORE-DOC-003, Row 722).
 * Records derived content (extracted text, previews, structured tables, audio transcripts) alongside complete
 * processing provenance (pipeline, engine, version, execution duration, and source asset checksum).
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';

const REPRESENTATION_TYPES = [
  'extracted_text',
  'text_preview',
  'spreadsheet_table',
  'transcript',
  'document_summary',
  'custom_derivative',
];

const REPRESENTATION_STATUSES = ['ready', 'processing', 'failed'];
const RETENTION_RULES = ['retain_with_asset', 'retain_after_binary_purge', 'ephemeral'];

const provenanceSchema = new mongoose.Schema(
  {
    pipeline: {
      type: String,
      required: [true, 'Provenance pipeline name is required.'],
      trim: true,
    },
    engine: {
      type: String,
      required: [true, 'Extraction engine identifier is required.'],
      trim: true,
    },
    engineVersion: {
      type: String,
      trim: true,
      default: '1.0.0',
    },
    sourceChecksum: {
      type: String,
      required: [true, 'Source asset checksum at extraction time is required.'],
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 64,
    },
    processedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    durationMs: {
      type: Number,
      min: 0,
      default: 0,
    },
    isTruncated: {
      type: Boolean,
      default: false,
    },
    pageRange: {
      startPage: { type: Number, default: null },
      endPage: { type: Number, default: null },
      totalPages: { type: Number, default: null },
    },
    sheetNames: {
      type: [String],
      default: () => [],
    },
    timeRange: {
      startSeconds: { type: Number, default: null },
      endSeconds: { type: Number, default: null },
      totalSeconds: { type: Number, default: null },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { _id: false }
);

const assetRepresentationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner user reference is required.'],
      index: true,
    },
    sourceAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: [true, 'Source asset reference is required.'],
      index: true,
    },
    representationType: {
      type: String,
      enum: REPRESENTATION_TYPES,
      required: [true, 'Representation type is required.'],
      index: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Derived content payload is required.'],
    },
    mimeType: {
      type: String,
      default: 'text/plain',
      trim: true,
      lowercase: true,
    },
    sizeBytes: {
      type: Number,
      min: 0,
      default: 0,
    },
    checksum: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null,
    },
    provenance: {
      type: provenanceSchema,
      required: [true, 'Processing provenance must be recorded.'],
    },
    status: {
      type: String,
      enum: REPRESENTATION_STATUSES,
      default: 'ready',
      index: true,
    },
    error: {
      type: String,
      default: null,
      trim: true,
    },
    retentionRule: {
      type: String,
      enum: RETENTION_RULES,
      default: 'retain_after_binary_purge',
      index: true,
    },
    isBinaryPurged: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for optimal lookup and ownership verification
assetRepresentationSchema.index(
  { owner: 1, sourceAssetId: 1, representationType: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
assetRepresentationSchema.index({ sourceAssetId: 1, status: 1 });
assetRepresentationSchema.index({ owner: 1, createdAt: -1 });

// Automatically calculate checksum and sizeBytes before saving if string content
assetRepresentationSchema.pre('save', function (next) {
  if (typeof this.content === 'string') {
    this.sizeBytes = Buffer.byteLength(this.content, 'utf8');
    this.checksum = crypto.createHash('sha256').update(this.content, 'utf8').digest('hex');
  } else if (this.content && typeof this.content === 'object') {
    const serialized = JSON.stringify(this.content);
    this.sizeBytes = Buffer.byteLength(serialized, 'utf8');
    this.checksum = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  }
  next();
});

/**
 * Soft deletes the representation.
 */
assetRepresentationSchema.methods.softDelete = async function softDelete() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

/**
 * Static method to idempotently upsert a representation for an asset.
 */
assetRepresentationSchema.statics.upsertRepresentation = async function upsertRepresentation({
  owner,
  sourceAssetId,
  representationType,
  content,
  mimeType = 'text/plain',
  provenance,
  retentionRule = 'retain_after_binary_purge',
  status = 'ready',
  error = null,
}) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const sizeBytes = Buffer.byteLength(contentStr, 'utf8');
  const checksum = crypto.createHash('sha256').update(contentStr, 'utf8').digest('hex');

  return this.findOneAndUpdate(
    {
      owner,
      sourceAssetId,
      representationType,
      isDeleted: false,
    },
    {
      $set: {
        content,
        mimeType,
        sizeBytes,
        checksum,
        provenance,
        retentionRule,
        status,
        error,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        owner,
        sourceAssetId,
        representationType,
        isBinaryPurged: false,
        isDeleted: false,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};

export const AssetRepresentation = mongoose.model('AssetRepresentation', assetRepresentationSchema);
export default AssetRepresentation;
