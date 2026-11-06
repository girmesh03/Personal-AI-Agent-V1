/**
 * @module modules/assets/persistence/Asset
 * @description Unified persistence model for private assets, uploads, and derived multimodal representations (FR-CORE-DOC-003, Row 51).
 * Replaces legacy fragmented models (such as standalone Audio.js) with a comprehensive metadata schema
 * encompassing text extraction, speech transcripts, provenance, and retention lifecycle.
 */

import mongoose from 'mongoose';
import { BASE_SCHEMA_OPTIONS } from '../../../infrastructure/database/schemaOptions.js';
import { ASSET_CONSTANTS } from '../../../utils/constants.js';
import { generateSignedDownloadToken } from '../storage/storageService.js';

const assetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Asset owner user reference is required.'],
      index: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original filename is required.'],
      trim: true,
      maxlength: 255,
    },
    sanitizedName: {
      type: String,
      required: [true, 'Sanitized filename is required.'],
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required.'],
      trim: true,
      lowercase: true,
    },
    sizeBytes: {
      type: Number,
      required: [true, 'Asset size in bytes is required.'],
      min: [0, 'Size in bytes cannot be negative.'],
    },
    sha256: {
      type: String,
      required: [true, 'SHA-256 hash is required for data integrity verification.'],
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 64,
      index: true,
    },
    storageProvider: {
      type: String,
      enum: ASSET_CONSTANTS.STORAGE_PROVIDERS,
      default: ASSET_CONSTANTS.DEFAULT_STORAGE_PROVIDER,
      required: true,
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key is required.'],
      unique: true,
      trim: true,
    },
    storagePath: {
      type: String,
      required: [true, 'Internal storage path reference is required.'],
      trim: true,
    },
    category: {
      type: String,
      enum: ASSET_CONSTANTS.CATEGORIES,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      trim: true,
      default: 'general_attachment',
      index: true,
    },
    status: {
      type: String,
      enum: ASSET_CONSTANTS.STATUSES,
      default: 'ready',
      index: true,
    },
    error: {
      type: String,
      default: null,
      trim: true,
    },
    retentionPolicy: {
      type: String,
      enum: ASSET_CONSTANTS.RETENTION_POLICIES,
      default: 'persistent',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    representations: {
      extractedText: {
        type: String,
        default: null,
      },
      textExtractionStatus: {
        type: String,
        enum: ['none', 'pending', 'extracted', 'failed'],
        default: 'none',
      },
      transcript: {
        text: { type: String, default: null },
        language: { type: String, default: null },
        durationSeconds: { type: Number, default: null },
        sttEngine: { type: String, default: null },
        status: {
          type: String,
          enum: ['none', 'pending', 'completed', 'failed'],
          default: 'none',
        },
        error: { type: String, default: null },
      },
      preview: {
        url: { type: String, default: null },
        storageKey: { type: String, default: null },
        mimeType: { type: String, default: null },
        width: { type: Number, default: null },
        height: { type: Number, default: null },
      },
      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({}),
      },
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
        // Do not expose internal storage paths to clients
        delete ret.storagePath;
        return ret;
      },
    },
  }
);

// Compound indexes for optimal query access
assetSchema.index({ owner: 1, createdAt: -1 });
assetSchema.index({ owner: 1, category: 1 });
assetSchema.index({ owner: 1, sha256: 1 });
assetSchema.index({ retentionPolicy: 1, expiresAt: 1 }, { sparse: true });

// Virtual aliases for compatibility with legacy V0 consumers (such as Audio model callers)
assetSchema.virtual('user').get(function () {
  return this.owner;
}).set(function (val) {
  this.owner = val;
});

assetSchema.virtual('path').get(function () {
  return this.storagePath;
});

assetSchema.virtual('size').get(function () {
  return this.sizeBytes;
});

assetSchema.virtual('fileName').get(function () {
  return this.sanitizedName;
});

assetSchema.virtual('transcription').get(function () {
  return this.representations?.transcript?.text || '';
}).set(function (val) {
  if (!this.representations) this.representations = {};
  if (!this.representations.transcript) this.representations.transcript = {};
  this.representations.transcript.text = val;
});

assetSchema.virtual('duration').get(function () {
  return this.representations?.transcript?.durationSeconds || null;
}).set(function (val) {
  if (!this.representations) this.representations = {};
  if (!this.representations.transcript) this.representations.transcript = {};
  this.representations.transcript.durationSeconds = val;
});

assetSchema.virtual('sttEngine').get(function () {
  return this.representations?.transcript?.sttEngine || null;
}).set(function (val) {
  if (!this.representations) this.representations = {};
  if (!this.representations.transcript) this.representations.transcript = {};
  this.representations.transcript.sttEngine = val;
});

/**
 * Soft deletes the asset.
 */
assetSchema.methods.softDelete = async function softDelete() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status = 'deleted';
  return this.save();
};

/**
 * Soft archives the asset.
 */
assetSchema.methods.archive = async function archive() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

/**
 * Generates an authenticated short-lived download token for the asset.
 *
 * @param {number} [expiresInSeconds=900]
 * @returns {string} Signed download token
 */
assetSchema.methods.generateDownloadToken = function generateDownloadToken(expiresInSeconds = 900) {
  return generateSignedDownloadToken({
    assetId: this._id.toString(),
    userId: this.owner.toString(),
    expiresInSeconds,
  });
};

export const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
