/**
 * @module models/Asset
 * @description Universal Mongoose model for multimodal media, attachments, and binary files.
 * Single source of truth for audio, images, and files in dedicated cloud storage.
 * Strictly adheres to Protocol 20 & 36 (JSDoc), Protocol 21 (user isolation),
 * Protocol 43 (cloud media storage exclusivity & zero local filesystem storage),
 * Protocol 48 (server-side document text extraction), Protocol 55 (pristine asset preservation),
 * and Protocol 71 (type contracts).
 */

import mongoose from 'mongoose';
import { ASSET_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {object} IAsset
 * @property {import('mongoose').Types.ObjectId} _id - Unique asset identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning user ID (Protocol 21 user isolation).
 * @property {import('mongoose').Types.ObjectId|null} chat - Scoped conversation thread (null for avatars/global).
 * @property {import('mongoose').Types.ObjectId|null} message - Scoped conversational turn (null while staged in composer).
 * @property {'file'|'image'|'audio'} kind - Strict 3-kind binary taxonomy (Protocol 55).
 * @property {string} fileName - Unique system storage filename (e.g. uuid.pdf).
 * @property {string} originalName - Original human-readable filename for UI badges and chips.
 * @property {string} mimeType - MIME type format of the binary content.
 * @property {number} sizeBytes - Binary file size in bytes.
 * @property {'cloudinary'|'google_drive'} storageProvider - Cloud storage provider (Protocol 43).
 * @property {string} storageKey - Unique cloud identifier (Cloudinary public_id or Drive fileId).
 * @property {string} secureUrl - Immutable secure HTTPS CDN URL for delivery.
 * @property {string|null} checksum - SHA-256 cryptographic digest for integrity and deduplication.
 * @property {number|null} duration - Audio recording duration in seconds.
 * @property {string|null} transcript - Speech-to-text transcript (Addis STT / Gemini audio).
 * @property {string|null} sttEngine - Speech recognition engine identifier that produced transcript.
 * @property {string|null} extractedText - Server-side extracted text from documents for grounded RAG (Protocol 48).
 * @property {'uploading'|'ready'|'failed'} status - Asynchronous media processing lifecycle state.
 * @property {string|null} error - Processing error explanation if upload or parsing failed.
 * @property {Date} createdAt - Asset creation timestamp.
 * @property {Date} updatedAt - Asset last modified timestamp.
 */

/**
 * Mongoose schema definition for the Asset collection.
 * @type {import('mongoose').Schema<IAsset>}
 */
const assetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required.'],
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      default: null,
      index: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true,
    },
    kind: {
      type: String,
      enum: {
        values: ASSET_CONSTANTS.KINDS,
        message: 'Asset kind `{VALUE}` is not supported. Must be one of file, image, or audio.',
      },
      required: [true, 'Asset kind is required.'],
      index: true,
    },
    fileName: {
      type: String,
      required: [true, 'File name is required.'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original file name is required.'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required.'],
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required.'],
      min: [1, 'File size must be at least 1 byte.'],
      validate: {
        validator: Number.isInteger,
        message: 'File size must be an integer number of bytes.',
      },
    },
    storageProvider: {
      type: String,
      enum: {
        values: ASSET_CONSTANTS.STORAGE_PROVIDERS,
        message: 'Storage provider `{VALUE}` is not supported.',
      },
      default: ASSET_CONSTANTS.DEFAULT_STORAGE_PROVIDER,
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key is required.'],
      trim: true,
    },
    secureUrl: {
      type: String,
      required: [true, 'Secure URL is required.'],
      trim: true,
    },
    checksum: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    duration: {
      type: Number,
      min: [0, 'Audio duration cannot be negative.'],
      default: null,
    },
    transcript: {
      type: String,
      default: null,
      trim: true,
    },
    sttEngine: {
      type: String,
      default: null,
      trim: true,
    },
    extractedText: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ASSET_CONSTANTS.STATUSES,
        message: 'Asset status `{VALUE}` is not supported.',
      },
      default: ASSET_CONSTANTS.DEFAULT_STATUS,
      index: true,
    },
    error: {
      type: String,
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

// Compound Indexes
// User-wide gallery filtering and kind-based asset queries
assetSchema.index({ user: 1, kind: 1, createdAt: -1 });
// Rapid lookup of all assets linked to a specific chat turn
assetSchema.index({ chat: 1, message: 1 });
// User-scoped cryptographic checksum deduplication queries
assetSchema.index({ user: 1, checksum: 1 });

/**
 * Pre-deleteOne document middleware hook cleaning up asset references from Message.assets.
 */
assetSchema.pre('deleteOne', { document: true, query: false }, async function () {
  await mongoose.model('Message').updateMany(
    { assets: this._id },
    { $pull: { assets: this._id } }
  );
});

/**
 * Pre-deleteOne query middleware hook cleaning up asset references from Message.assets.
 */
assetSchema.pre('deleteOne', { document: false, query: true }, async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await mongoose.model('Message').updateMany(
      { assets: doc._id },
      { $pull: { assets: doc._id } }
    );
  }
});

/**
 * Pre-findOneAndDelete middleware hook cleaning up asset references from Message.assets.
 */
assetSchema.pre('findOneAndDelete', async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await mongoose.model('Message').updateMany(
      { assets: doc._id },
      { $pull: { assets: doc._id } }
    );
  }
});

/**
 * Defensive virtual property strictly prohibiting Protocol 43 local server filesystem paths.
 * Calling code attempting to set `path` fails immediately.
 */
assetSchema
  .virtual('path')
  .get(() => undefined)
  .set(function () {
    throw new Error('Local server filesystem storage paths are strictly forbidden per Protocol 43.');
  });

/**
 * Mongoose model instance for the Asset collection.
 * @type {import('mongoose').Model<IAsset>}
 */
export const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
