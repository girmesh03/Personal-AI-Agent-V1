/**
 * @file backend/src/models/Asset.js
 * @module models/Asset
 * @description Modality-neutral digital asset management model for Operon (Personal AI Agent V1).
 * Represents all user-uploaded and assistant-generated media assets (documents, images, audio, video).
 *
 * Architectural Invariants:
 * 1. Single-User Isolation: Every asset is strictly scoped to its authenticated user (`user: { type: ObjectId, ref: 'User', required: true }`).
 * 2. Modality Neutrality: Unified registry handling documents, images, audio recordings, video clips, and avatars.
 * 3. Centralized Storage Abstraction: Storage metadata is isolated in a nested `storage` subdocument (`driver`, `key`, `checksumSha256`).
 * 4. Reverse Provenance Links: Maintains non-authoritative references back to owning `chat`, `message`, `branch`, or `report`.
 * 5. TTL Purge Compliance: Temporary assets automatically expire using `{ expireAfterSeconds: 0, partialFilterExpression: { purgeAfter: { $type: 'date' } } }`.
 * 6. Multilingual Text Search: Text index uses `{ default_language: 'none', language_override: 'no_language_override' }` to protect Ethiopic scripts and prevent `language: null` subfield conflicts.
 */

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { BASE_SCHEMA_OPTIONS, EMBEDDED_SCHEMA_OPTIONS } from '../config/schemaOptions.js';
import { ASSET_CONSTANTS } from '../utils/constants.js';

/**
 * @typedef {Object} IAssetStorage
 * @property {'local'|'cloudinary'} driver - Physical storage driver engine.
 * @property {string} key - Unique storage blob identifier / relative path.
 * @property {string|null} [bucket=null] - Cloud bucket or root folder identifier.
 * @property {string|null} [path=null] - Canonical relative storage path (select: false).
 * @property {string|null} [url=null] - Derived or public CDN access URL.
 * @property {string|null} [publicId=null] - Cloudinary public identifier.
 * @property {number} bytes - Stored payload size in bytes.
 * @property {string} checksumSha256 - SHA-256 cryptographic hash of asset content.
 */

/**
 * @typedef {Object} IAssetImageMetadata
 * @property {number|null} [width=null] - Image width in pixels.
 * @property {number|null} [height=null] - Image height in pixels.
 * @property {string|null} [format=null] - Image format extension.
 */

/**
 * @typedef {Object} IAssetAudioMetadata
 * @property {number|null} [durationSeconds=null] - Audio playback duration in seconds.
 * @property {number|null} [sampleRate=null] - Audio sample rate in Hz.
 * @property {number|null} [channels=null] - Audio channels count (1=mono, 2=stereo).
 * @property {string|null} [codec=null] - Audio encoding codec.
 */

/**
 * @typedef {Object} IAssetDocumentMetadata
 * @property {number|null} [pageCount=null] - Total page count in document.
 * @property {string|null} [title=null] - Document title extracted from metadata.
 * @property {string|null} [author=null] - Document author extracted from metadata.
 */

/**
 * @typedef {Object} IAssetExtractedText
 * @property {string} text - Extracted raw textual content from document.
 * @property {Date} extractedAt - Extraction completion timestamp.
 * @property {string} [method='native'] - Extraction technique ('pdf-parse'|'tesseract'|'native').
 * @property {number|null} [pageCount=null] - Page count processed.
 */

/**
 * @typedef {Object} IAssetTranscription
 * @property {string} text - Amharic or multilingual transcription text.
 * @property {string} engine - STT engine identifier used for transcription.
 * @property {string|null} [language=null] - Detected or specified language.
 * @property {number|null} [durationSeconds=null] - Audio duration processed.
 * @property {Date} completedAt - Transcription completion timestamp.
 */

/**
 * @typedef {Object} IAssetProvenance
 * @property {import('mongoose').Types.ObjectId|null} [chat=null] - Originating conversation thread.
 * @property {import('mongoose').Types.ObjectId|null} [message=null] - Originating message turn.
 * @property {string|null} [branch=null] - Originating conversation branch ID.
 * @property {import('mongoose').Types.ObjectId|null} [report=null] - Originating operational report.
 * @property {string|null} [turnId=null] - Originating turn UUID.
 * @property {string|null} [generatedBy=null] - Agent tool or subsystem that produced asset.
 */

/**
 * @typedef {Object} IAsset
 * @property {import('mongoose').Types.ObjectId} _id - Unique asset identifier.
 * @property {import('mongoose').Types.ObjectId} user - Owning supervisor User reference.
 * @property {'audio'|'document'|'image'|'video'|'spreadsheet'} modality - Asset media category.
 * @property {'user_upload'|'avatar'|'generated_document'|'generated_image'|'voice_recording'|'attachment'|'report_evidence'|'audio_turn'|'artifact'} kind - Functional lifecycle category.
 * @property {string} fileName - Sanitized filename on storage target.
 * @property {string} originalName - Original upload or export filename.
 * @property {string} mimeType - Canonical MIME type string.
 * @property {number} size - File size in bytes.
 * @property {IAssetStorage} storage - Storage driver details and cryptographic checksum.
 * @property {IAssetImageMetadata|IAssetAudioMetadata|IAssetDocumentMetadata|Record<string, any>} [metadata] - Modality-specific metadata.
 * @property {IAssetExtractedText} [extractedText] - Text extracted from documents/PDFs.
 * @property {IAssetTranscription} [transcription] - Speech-to-text transcript.
 * @property {IAssetProvenance} [provenance] - Origin lineage tracing.
 * @property {boolean} [isArchived=false] - Soft-archival lifecycle flag.
 * @property {Date|null} [archivedAt=null] - Archival timestamp.
 * @property {boolean} [isDeleted=false] - Soft-deletion flag.
 * @property {Date|null} [deletedAt=null] - Soft-deletion timestamp.
 * @property {Date|null} [purgeAfter=null] - TTL expiration timestamp for auto-purging temporary files.
 * @property {string} [downloadUrl] - Derived virtual HTTP download URL.
 * @property {string} [streamUrl] - Derived virtual HTTP streaming URL.
 * @property {string} [viewUrl] - Derived virtual HTTP view URL.
 * @property {boolean} [isExpired] - Derived virtual indicating if asset passed TTL threshold.
 * @property {Date} createdAt - Document creation timestamp.
 * @property {Date} updatedAt - Document last modification timestamp.
 */

/**
 * Sanitizes a user-supplied file name to prevent directory traversal and null byte injection.
 * @param {string} rawName - Raw file name string.
 * @returns {string} Sanitized file name.
 */
export const sanitizeFileName = (rawName) => {
  if (typeof rawName !== 'string') return 'file';
  const cleaned = rawName
    .replace(/\0/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim();
  return cleaned.slice(0, ASSET_CONSTANTS.FILENAME_MAX_LENGTH) || 'file';
};

/**
 * Sanitizes JSON and Object transformations of Asset documents by stripping internal paths and IDs.
 * @param {import('mongoose').Document} doc - Document instance.
 * @param {Record<string, any>} ret - Serialized plain object.
 * @returns {Record<string, any>} Sanitized plain object.
 */
export const sanitizeAssetTransform = (doc, ret) => {
  if (!ret || typeof ret !== 'object') return ret;
  delete ret.id;
  delete ret.__v;
  if (ret.storage && typeof ret.storage === 'object') {
    delete ret.storage.path;
  }
  return ret;
};

/**
 * Evaluates whether candidate path touches target path directly or via hierarchy.
 * @param {string} path - Candidate path.
 * @param {string} target - Reference path.
 * @returns {boolean} True if paths overlap.
 */
const pathTouchesTarget = (path, target) => {
  if (path === target) return true;
  if (path.startsWith(`${target}.`)) return true;
  if (target.startsWith(`${path}.`)) return true;
  return false;
};

/**
 * Checks whether an operator layer has a path conflict with a target path.
 * @param {Record<string, any>} layer - Object layer to inspect.
 * @param {string} target - Target path.
 * @returns {boolean} True if a conflict exists.
 */
const hasLayerPathConflict = (layer, target) => {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return false;
  return Object.keys(layer).some((key) => pathTouchesTarget(key, target));
};

/**
 * Embedded subdocument schema defining physical storage driver, key, relative path, public ID, and SHA-256 checksum.
 */
const storageSchema = new mongoose.Schema(
  {
    driver: {
      type: String,
      enum: {
        values: ASSET_CONSTANTS.STORAGE_DRIVERS,
        message: '{VALUE} is not a valid storage driver.',
      },
      required: [true, 'Storage driver is required.'],
      default: ASSET_CONSTANTS.DEFAULT_STORAGE_DRIVER,
    },
    key: {
      type: String,
      required: [true, 'Storage key is required.'],
      trim: true,
      maxlength: [ASSET_CONSTANTS.STORAGE_KEY_MAX_LENGTH, `Storage key cannot exceed ${ASSET_CONSTANTS.STORAGE_KEY_MAX_LENGTH} characters.`],
    },
    path: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.STORAGE_KEY_MAX_LENGTH, `Storage path cannot exceed ${ASSET_CONSTANTS.STORAGE_KEY_MAX_LENGTH} characters.`],
    },
    cloudUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.CLOUD_URL_MAX_LENGTH, `Cloud URL cannot exceed ${ASSET_CONSTANTS.CLOUD_URL_MAX_LENGTH} characters.`],
    },
    publicId: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.PUBLIC_ID_MAX_LENGTH, `Public ID cannot exceed ${ASSET_CONSTANTS.PUBLIC_ID_MAX_LENGTH} characters.`],
    },
    folder: {
      type: String,
      default: null,
      trim: true,
      maxlength: 255,
    },
    bucket: {
      type: String,
      default: null,
      trim: true,
      maxlength: 255,
    },
    checksumSha256: {
      type: String,
      default: null,
      trim: true,
      match: [/^[a-f0-9]{64}$/i, 'checksumSha256 must be a valid 64-character hex string.'],
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema defining modality-specific metadata for images, audio, documents, and spreadsheets.
 */
const metadataSchema = new mongoose.Schema(
  {
    durationSeconds: {
      type: Number,
      default: null,
      min: [0, 'Audio duration cannot be negative.'],
      max: [ASSET_CONSTANTS.MAX_AUDIO_DURATION_SECONDS, `Duration exceeds ${ASSET_CONSTANTS.MAX_AUDIO_DURATION_SECONDS}s.`],
    },
    sampleRate: {
      type: Number,
      default: null,
      min: [8000, 'Sample rate minimum is 8000Hz.'],
      max: [192000, 'Sample rate maximum is 192000Hz.'],
    },
    channels: {
      type: Number,
      default: null,
      min: [1, 'Channels minimum is 1.'],
      max: [8, 'Channels maximum is 8.'],
    },
    bitrate: {
      type: Number,
      default: null,
      min: [0, 'Bitrate cannot be negative.'],
    },
    waveform: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (arr) => !arr || (arr.length <= ASSET_CONSTANTS.MAX_WAVEFORM_POINTS && arr.every((v) => typeof v === 'number' && v >= 0 && v <= 1)),
        message: `Waveform must be an array of at most ${ASSET_CONSTANTS.MAX_WAVEFORM_POINTS} normalized floats (0.0 to 1.0).`,
      },
    },
    width: {
      type: Number,
      default: null,
      min: [1, 'Image width must be at least 1px.'],
      max: [16384, 'Image width exceeds 16384px limit.'],
    },
    height: {
      type: Number,
      default: null,
      min: [1, 'Image height must be at least 1px.'],
      max: [16384, 'Image height exceeds 16384px limit.'],
    },
    aspectRatio: {
      type: Number,
      default: null,
      min: [0.01, 'Aspect ratio must be positive.'],
    },
    thumbnailKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.STORAGE_KEY_MAX_LENGTH, 'Thumbnail key too long.'],
    },
    pageCount: {
      type: Number,
      default: null,
      min: [0, 'Page count cannot be negative.'],
    },
    wordCount: {
      type: Number,
      default: null,
      min: [0, 'Word count cannot be negative.'],
    },
    sheetNames: {
      type: [String],
      default: undefined,
      validate: {
        validator: (arr) => !arr || arr.length <= 100,
        message: 'sheetNames cannot exceed 100 entries.',
      },
    },
    rowCount: {
      type: Number,
      default: null,
      min: [0, 'Row count cannot be negative.'],
    },
    columnCount: {
      type: Number,
      default: null,
      min: [0, 'Column count cannot be negative.'],
    },
    hasFormulas: {
      type: Boolean,
      default: null,
    },
    generatorTool: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    generatorToolCallId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    generationFormat: {
      type: String,
      default: null,
      trim: true,
      enum: {
        values: [...ASSET_CONSTANTS.GENERATED_FORMATS, null],
        message: '{VALUE} is not a supported generation format.',
      },
    },
    title: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.FILENAME_MAX_LENGTH, 'Title too long.'],
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema for audio Speech-to-Text transcriptions and segment timestamps.
 */
const transcriptionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: [ASSET_CONSTANTS.TRANSCRIPTION_MAX_LENGTH, `Transcription text exceeds limit of ${ASSET_CONSTANTS.TRANSCRIPTION_MAX_LENGTH} characters.`],
    },
    language: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 10,
    },
    detectedLanguage: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 10,
    },
    confidence: {
      type: Number,
      default: null,
      min: [0.0, 'Confidence cannot be less than 0.0.'],
      max: [1.0, 'Confidence cannot exceed 1.0.'],
    },
    engine: {
      type: String,
      default: null,
      trim: true,
      enum: {
        values: [...ASSET_CONSTANTS.STT_ENGINES, null],
        message: '{VALUE} is not a supported STT engine.',
      },
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ASSET_CONSTANTS.TRANSCRIPTION_STATUSES,
        message: '{VALUE} is not a valid transcription status.',
      },
      default: ASSET_CONSTANTS.TRANSCRIPTION_STATUS.NONE,
    },
    error: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.ERROR_MESSAGE_MAX_LENGTH, 'Error message too long.'],
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
      min: [0, 'Duration cannot be negative.'],
    },
    wordCount: {
      type: Number,
      default: null,
      min: [0, 'Word count cannot be negative.'],
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema for raw textual content parsed from ingested documents.
 */
const extractedTextSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: [ASSET_CONSTANTS.EXTRACTED_TEXT_MAX_LENGTH, `Extracted text exceeds limit of ${ASSET_CONSTANTS.EXTRACTED_TEXT_MAX_LENGTH} characters.`],
    },
    charCount: {
      type: Number,
      default: 0,
      min: [0, 'Character count cannot be negative.'],
    },
    isTruncated: {
      type: Boolean,
      default: false,
    },
    method: {
      type: String,
      default: null,
      trim: true,
      enum: {
        values: [...ASSET_CONSTANTS.EXTRACTION_METHODS, null],
        message: '{VALUE} is not a valid extraction method.',
      },
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ASSET_CONSTANTS.EXTRACTION_STATUSES,
        message: '{VALUE} is not a valid extraction status.',
      },
      default: ASSET_CONSTANTS.EXTRACTION_STATUS.NONE,
    },
    extractedAt: {
      type: Date,
      default: null,
    },
    error: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.ERROR_MESSAGE_MAX_LENGTH, 'Error message too long.'],
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema for Text-to-Speech synthesis telemetry and voice parameters.
 */
const ttsSchema = new mongoose.Schema(
  {
    voiceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    language: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10,
    },
    sanitizedTextSnippet: {
      type: String,
      default: null,
      trim: true,
      maxlength: [ASSET_CONSTANTS.TTS_TEXT_SNIPPET_MAX_LENGTH, 'TTS text snippet too long.'],
    },
    clientRequestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    sourceChat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      default: null,
    },
    sourceMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Embedded subdocument schema linking the asset back to originating chats, messages, turns, or reports.
 */
const provenanceSchema = new mongoose.Schema(
  {
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
    turnId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    report: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report',
      default: null,
      index: true,
    },
  },
  EMBEDDED_SCHEMA_OPTIONS
);

/**
 * Root Mongoose schema definition for the unified Asset registry.
 * Manages physical and cloud media blobs, modality alignment, and TTL lifecycles.
 */
const assetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Asset must belong to an authenticated user.'],
      immutable: true,
      index: true,
    },
    originalName: {
      type: String,
      required: [true, 'Asset original filename is required.'],
      trim: true,
      maxlength: [ASSET_CONSTANTS.FILENAME_MAX_LENGTH, `Filename cannot exceed ${ASSET_CONSTANTS.FILENAME_MAX_LENGTH} characters.`],
    },
    fileName: {
      type: String,
      required: [true, 'Asset storage filename is required.'],
      trim: true,
      maxlength: [ASSET_CONSTANTS.FILENAME_MAX_LENGTH, `Filename cannot exceed ${ASSET_CONSTANTS.FILENAME_MAX_LENGTH} characters.`],
    },
    mimeType: {
      type: String,
      required: [true, 'Asset MIME type is required.'],
      trim: true,
      lowercase: true,
      maxlength: [ASSET_CONSTANTS.MIME_TYPE_MAX_LENGTH, `MIME type cannot exceed ${ASSET_CONSTANTS.MIME_TYPE_MAX_LENGTH} characters.`],
      enum: {
        values: ASSET_CONSTANTS.ALLOWED_MIME_TYPES,
        message: '{VALUE} is not an allowed asset MIME type.',
      },
    },
    fileExtension: {
      type: String,
      required: [true, 'Asset file extension is required.'],
      trim: true,
      lowercase: true,
      maxlength: [16, 'File extension cannot exceed 16 characters.'],
    },
    modality: {
      type: String,
      required: [true, 'Asset modality is required.'],
      enum: {
        values: ASSET_CONSTANTS.MODALITIES,
        message: '{VALUE} is not a valid asset modality.',
      },
      index: true,
    },
    kind: {
      type: String,
      required: [true, 'Asset kind is required.'],
      enum: {
        values: ASSET_CONSTANTS.KINDS,
        message: '{VALUE} is not a valid asset kind.',
      },
      index: true,
    },
    sizeBytes: {
      type: Number,
      required: [true, 'Asset size in bytes is required.'],
      min: [1, 'Asset file cannot be empty (minimum 1 byte).'],
      max: [
        ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES,
        `Asset size exceeds maximum limit of ${ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      ],
      validate: {
        validator: Number.isInteger,
        message: 'Asset sizeBytes must be an integer.',
      },
    },
    storage: {
      _id: false,
      type: storageSchema,
      required: [true, 'Asset storage configuration is required.'],
    },
    metadata: {
      _id: false,
      type: metadataSchema,
      default: () => ({}),
    },
    transcription: {
      _id: false,
      type: transcriptionSchema,
      default: () => ({ status: 'none', text: '', confidence: null, engine: null, error: null, completedAt: null }),
    },
    extractedText: {
      _id: false,
      type: extractedTextSchema,
      default: () => ({ status: 'none', text: '', charCount: 0, isTruncated: false, method: null, extractedAt: null, error: null }),
    },
    tts: {
      _id: false,
      type: ttsSchema,
      default: null,
    },
    provenance: {
      _id: false,
      type: provenanceSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ASSET_CONSTANTS.LIFECYCLE_STATUSES,
        message: '{VALUE} is not a valid asset lifecycle status.',
      },
      default: ASSET_CONSTANTS.DEFAULT_LIFECYCLE_STATUS,
      index: true,
    },
    retentionPolicy: {
      type: String,
      required: true,
      enum: {
        values: ASSET_CONSTANTS.RETENTION_POLICIES,
        message: '{VALUE} is not a valid retention policy.',
      },
      default: ASSET_CONSTANTS.DEFAULT_RETENTION_POLICY,
      index: true,
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
    purgeAfter: {
      type: Date,
      default: null,
    },
  },
  {
    ...BASE_SCHEMA_OPTIONS,
    toJSON: {
      ...BASE_SCHEMA_OPTIONS.toJSON,
      transform: sanitizeAssetTransform,
    },
    toObject: {
      ...BASE_SCHEMA_OPTIONS.toObject,
      transform: sanitizeAssetTransform,
    },
  }
);

/**
 * Derived virtual getter: downloadUrl
 * Relative HTTP endpoint URL for authenticated attachment download.
 *
 * @memberof assetSchema
 * @returns {string|undefined} Download URL or undefined if document is unpersisted.
 */
assetSchema.virtual('downloadUrl').get(function () {
  if (!this._id) return undefined;
  return `/api/v1/assets/${this._id}/download`;
});

/**
 * Derived virtual getter: streamUrl
 * Relative HTTP endpoint URL for media streaming playback.
 *
 * @memberof assetSchema
 * @returns {string|undefined} Streaming URL or undefined if document is unpersisted.
 */
assetSchema.virtual('streamUrl').get(function () {
  if (!this._id) return undefined;
  return `/api/v1/assets/${this._id}/stream`;
});

/**
 * Derived virtual getter: viewUrl
 * Relative HTTP endpoint URL for inline browser preview.
 *
 * @memberof assetSchema
 * @returns {string|undefined} Preview URL or undefined if document is unpersisted.
 */
assetSchema.virtual('viewUrl').get(function () {
  if (!this._id) return undefined;
  return `/api/v1/assets/${this._id}/view`;
});

/**
 * Derived virtual getter: isExpired
 * Checks whether asset has passed its purgeAfter TTL expiration threshold.
 *
 * @memberof assetSchema
 * @returns {boolean} True if current time exceeds purgeAfter timestamp.
 */
assetSchema.virtual('isExpired').get(function () {
  if (!this.purgeAfter) return false;
  return this.purgeAfter.getTime() <= Date.now();
});

/**
 * Validates that the asset MIME type strictly aligns with the declared modality.
 *
 * @param {string} modality - Asset media modality ('audio'|'document'|'image'|'video'|'spreadsheet').
 * @param {string} mimeType - MIME type to verify.
 * @throws {Error} If MIME type is incompatible with modality.
 */
const validateModalityMimeAlignment = (modality, mimeType) => {
  if (!modality || !mimeType) return;
  const mime = mimeType.toLowerCase();
  switch (modality) {
    case ASSET_CONSTANTS.MODALITY.IMAGE:
      if (!ASSET_CONSTANTS.ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with image modality.`);
      }
      break;
    case ASSET_CONSTANTS.MODALITY.AUDIO:
      if (!ASSET_CONSTANTS.ALLOWED_AUDIO_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with audio modality.`);
      }
      break;
    case ASSET_CONSTANTS.MODALITY.DOCUMENT:
      if (!ASSET_CONSTANTS.ALLOWED_DOCUMENT_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with document modality.`);
      }
      break;
    case ASSET_CONSTANTS.MODALITY.SPREADSHEET:
      if (!ASSET_CONSTANTS.ALLOWED_SPREADSHEET_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with spreadsheet modality.`);
      }
      break;
    case ASSET_CONSTANTS.MODALITY.TEXT:
      if (!ASSET_CONSTANTS.ALLOWED_TEXT_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with text modality.`);
      }
      break;
    case ASSET_CONSTANTS.MODALITY.ARCHIVE:
      if (!ASSET_CONSTANTS.ALLOWED_ARCHIVE_MIME_TYPES.includes(mime)) {
        throw new Error(`MIME type "${mime}" is not aligned with archive modality.`);
      }
      break;
    default:
      throw new Error(`Unknown asset modality "${modality}".`);
  }
};

/**
 * Validates that storage configuration satisfies driver-specific mandatory fields.
 *
 * @param {object} storage - Storage descriptor object.
 * @throws {Error} If mandatory fields for driver are missing.
 */
const validateStorageDriverRequirements = (storage) => {
  if (!storage || typeof storage !== 'object') {
    throw new Error('Storage configuration is required.');
  }
  const driver = storage.driver || ASSET_CONSTANTS.DEFAULT_STORAGE_DRIVER;
  if (driver === ASSET_CONSTANTS.STORAGE_DRIVER.LOCAL) {
    if (!storage.path && !storage.key) {
      throw new Error('Local storage driver requires storage.path or storage.key.');
    }
  } else if (driver === ASSET_CONSTANTS.STORAGE_DRIVER.CLOUDINARY) {
    if (!storage.publicId && !storage.cloudUrl) {
      throw new Error('Cloudinary driver requires storage.publicId or storage.cloudUrl.');
    }
  } else if (driver === ASSET_CONSTANTS.STORAGE_DRIVER.GOOGLE_DRIVE) {
    if (!storage.publicId) {
      throw new Error('Google Drive driver requires storage.publicId (drive file ID).');
    }
  }
};

/**
 * Document Pre-validation Middleware:
 * Enforces owner immutability, sanitizes original filename, validates modality-to-MIME alignment,
 * verifies storage driver requirements, synchronizes archival timestamps, and calculates ephemeral TTL purge dates.
 */
assetSchema.pre('validate', function () {
  if (!this.isNew && this.isModified('user')) {
    throw new Error('Asset owner (user) is immutable and cannot be changed.');
  }

  if (this.originalName) {
    this.originalName = sanitizeFileName(this.originalName);
  }

  const modalityKnown = this.isSelected ? this.isSelected('modality') : true;
  const mimeKnown = this.isSelected ? this.isSelected('mimeType') : true;
  if (!this.isNew) {
    if (this.isModified('modality') && !mimeKnown) {
      throw new Error('Cannot modify asset modality without selecting mimeType.');
    }
    if (this.isModified('mimeType') && !modalityKnown) {
      throw new Error('Cannot modify asset mimeType without selecting modality.');
    }
  }
  if (modalityKnown && mimeKnown && this.modality && this.mimeType) {
    validateModalityMimeAlignment(this.modality, this.mimeType);
  }

  const storageKnown = this.isSelected ? this.isSelected('storage') : true;
  if (storageKnown && this.storage) {
    validateStorageDriverRequirements(this.storage);
  }

  const isDeletedKnown = this.isSelected ? this.isSelected('isDeleted') : true;
  const deletedAtKnown = this.isSelected ? this.isSelected('deletedAt') : true;
  if (isDeletedKnown) {
    if (this.isDeleted) {
      if (deletedAtKnown && !this.deletedAt) {
        this.deletedAt = new Date();
      }
    } else {
      if (deletedAtKnown) {
        this.deletedAt = null;
      }
    }
  }

  const isArchivedKnown = this.isSelected ? this.isSelected('isArchived') : true;
  const archivedAtKnown = this.isSelected ? this.isSelected('archivedAt') : true;
  if (isArchivedKnown) {
    if (this.isArchived) {
      if (archivedAtKnown && !this.archivedAt) {
        this.archivedAt = new Date();
      }
    } else {
      if (archivedAtKnown) {
        this.archivedAt = null;
      }
    }
  }

  const policyKnown = this.isSelected ? this.isSelected('retentionPolicy') : true;
  const purgeKnown = this.isSelected ? this.isSelected('purgeAfter') : true;
  if (policyKnown && purgeKnown && this.retentionPolicy === ASSET_CONSTANTS.RETENTION_POLICY.EPHEMERAL && !this.purgeAfter) {
    this.purgeAfter = new Date(Date.now() + ASSET_CONSTANTS.EPHEMERAL_TTL_MS);
  }
});

/**
 * Query Pre-update Middleware:
 * Enforces immutability of user and _id, validates modality and storage drivers on updates,
 * and maintains soft-deletion and archival timestamp synchronization.
 */
assetSchema.pre(['findOneAndUpdate', 'updateOne'], function () {
  const update = this.getUpdate();
  if (!update || typeof update !== 'object') return;

  const operatorEntries = Object.entries(update).filter(([key]) => key.startsWith('$'));
  const immutablePaths = ['user', '_id'];

  for (const [op, opLayer] of operatorEntries) {
    if (!opLayer || typeof opLayer !== 'object' || Array.isArray(opLayer)) continue;
    if (op === '$setOnInsert') continue;
    for (const blockedPath of immutablePaths) {
      if (
        hasLayerPathConflict(opLayer, blockedPath) ||
        (op === '$rename' &&
          Object.values(opLayer).some(
            (dst) => typeof dst === 'string' && pathTouchesTarget(dst, blockedPath)
          ))
      ) {
        throw new Error(`Cannot modify immutable field "${blockedPath}" in query update.`);
      }
    }
  }

  for (const key of Object.keys(update)) {
    if (!key.startsWith('$')) {
      for (const blockedPath of immutablePaths) {
        if (pathTouchesTarget(key, blockedPath)) {
          throw new Error(`Cannot modify immutable field "${blockedPath}" in query update.`);
        }
      }
    }
  }

  const setLayer = update.$set || {};
  const hasModality = Object.hasOwn(setLayer, 'modality');
  const hasMime = Object.hasOwn(setLayer, 'mimeType');
  if (hasModality && hasMime) {
    validateModalityMimeAlignment(setLayer.modality, setLayer.mimeType);
  }

  if (setLayer.storage && typeof setLayer.storage === 'object') {
    validateStorageDriverRequirements(setLayer.storage);
  }

  const now = new Date();
  if (Object.hasOwn(setLayer, 'isDeleted')) {
    if (setLayer.isDeleted === true && !Object.hasOwn(setLayer, 'deletedAt')) {
      setLayer.deletedAt = now;
    } else if (setLayer.isDeleted === false && !Object.hasOwn(setLayer, 'deletedAt')) {
      setLayer.deletedAt = null;
    }
  }
  if (Object.hasOwn(setLayer, 'isArchived')) {
    if (setLayer.isArchived === true && !Object.hasOwn(setLayer, 'archivedAt')) {
      setLayer.archivedAt = now;
    } else if (setLayer.isArchived === false && !Object.hasOwn(setLayer, 'archivedAt')) {
      setLayer.archivedAt = null;
    }
  }
  if (setLayer.retentionPolicy === ASSET_CONSTANTS.RETENTION_POLICY.EPHEMERAL && !Object.hasOwn(setLayer, 'purgeAfter')) {
    setLayer.purgeAfter = new Date(Date.now() + ASSET_CONSTANTS.EPHEMERAL_TTL_MS);
  }
});

assetSchema.index({ user: 1, modality: 1, createdAt: -1 });
assetSchema.index({ user: 1, kind: 1, createdAt: -1 });
assetSchema.index({ user: 1, 'provenance.chat': 1, createdAt: -1 }, { sparse: true });
assetSchema.index({ user: 1, 'provenance.report': 1, createdAt: -1 }, { sparse: true });
assetSchema.index(
  { user: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false, isArchived: false } }
);
assetSchema.index(
  { user: 1, archivedAt: -1 },
  { partialFilterExpression: { isArchived: true } }
);
assetSchema.index(
  { purgeAfter: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { purgeAfter: { $type: 'date' } } }
);
assetSchema.index({ user: 1, 'storage.key': 1 }, { unique: true });
assetSchema.index(
  { user: 1, originalName: 'text', 'transcription.text': 'text', 'extractedText.text': 'text' },
  { default_language: 'none', language_override: 'no_language_override', name: 'asset_fulltext_search' }
);

assetSchema.plugin(mongoosePaginate);

/**
 * Finds an active, non-deleted Asset document strictly scoped to the authenticated user.
 *
 * @memberof assetSchema.statics
 * @param {import('mongoose').Types.ObjectId|string} userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string} assetId - Target Asset ID.
 * @param {object} [options] - Query options.
 * @param {import('mongoose').ClientSession} [options.session] - MongoDB session.
 * @param {any} [options.projection] - Field selection projection.
 * @returns {import('mongoose').Query} Mongoose query.
 */
assetSchema.statics.findUserAsset = function (userId, assetId, { session, projection } = {}) {
  if (!userId || !assetId) return null;
  const query = this.findOne({ _id: assetId, user: userId, isDeleted: false });
  if (projection) query.select(projection);
  if (session) query.session(session);
  return query;
};

/**
 * Soft-deletes a user-owned Asset document by setting isDeleted=true and deletedAt=now.
 *
 * @memberof assetSchema.statics
 * @param {import('mongoose').Types.ObjectId|string} userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string} assetId - Target Asset ID.
 * @param {object} [options] - Operation options.
 * @param {import('mongoose').ClientSession} [options.session] - MongoDB session.
 * @returns {Promise<import('mongoose').Document|null>} Updated document.
 */
assetSchema.statics.softDeleteUserAsset = async function (userId, assetId, { session } = {}) {
  if (!userId || !assetId) return null;
  const now = new Date();
  return this.findOneAndUpdate(
    { _id: assetId, user: userId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: now } },
    { new: true, runValidators: true, session: session || null }
  );
};

/**
 * Archives a user-owned Asset document by setting isArchived=true and archivedAt=now.
 *
 * @memberof assetSchema.statics
 * @param {import('mongoose').Types.ObjectId|string} userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string} assetId - Target Asset ID.
 * @param {object} [options] - Operation options.
 * @param {import('mongoose').ClientSession} [options.session] - MongoDB session.
 * @returns {Promise<import('mongoose').Document|null>} Updated document.
 */
assetSchema.statics.archiveUserAsset = async function (userId, assetId, { session } = {}) {
  if (!userId || !assetId) return null;
  const now = new Date();
  return this.findOneAndUpdate(
    { _id: assetId, user: userId, isArchived: false, isDeleted: false },
    { $set: { isArchived: true, archivedAt: now } },
    { new: true, runValidators: true, session: session || null }
  );
};

/**
 * Restores a previously soft-deleted or archived user-owned Asset document.
 *
 * @memberof assetSchema.statics
 * @param {import('mongoose').Types.ObjectId|string} userId - Authenticated user ID.
 * @param {import('mongoose').Types.ObjectId|string} assetId - Target Asset ID.
 * @param {object} [options] - Operation options.
 * @param {import('mongoose').ClientSession} [options.session] - MongoDB session.
 * @returns {Promise<import('mongoose').Document|null>} Updated document.
 */
assetSchema.statics.restoreUserAsset = async function (userId, assetId, { session } = {}) {
  if (!userId || !assetId) return null;
  return this.findOneAndUpdate(
    { _id: assetId, user: userId },
    { $set: { isDeleted: false, deletedAt: null, isArchived: false, archivedAt: null } },
    { new: true, runValidators: true, session: session || null }
  );
};

/**
 * Batch verifies that an array of Asset IDs are strictly owned by the specified user and not deleted.
 *
 * @memberof assetSchema.statics
 * @param {import('mongoose').Types.ObjectId|string} userId - Authenticated user ID.
 * @param {Array<import('mongoose').Types.ObjectId|string>} assetIds - Candidate Asset IDs.
 * @param {object} [options] - Operation options.
 * @param {import('mongoose').ClientSession} [options.session] - MongoDB session.
 * @returns {Promise<{ allValid: boolean, validIds: string[], invalidIds: string[] }>} Verification summary.
 */
assetSchema.statics.verifyOwnership = async function (userId, assetIds, { session } = {}) {
  if (!userId || !Array.isArray(assetIds) || assetIds.length === 0) {
    return { allValid: false, validIds: [], invalidIds: [] };
  }
  const uniqueIds = [...new Set(assetIds.map(String))];
  const found = await this.find(
    { _id: { $in: uniqueIds }, user: userId, isDeleted: false },
    { _id: 1 },
    session ? { session } : {}
  ).lean();
  const validIds = found.map((d) => String(d._id));
  const validSet = new Set(validIds);
  const invalidIds = uniqueIds.filter((id) => !validSet.has(id));
  return {
    allValid: invalidIds.length === 0,
    validIds,
    invalidIds,
  };
};

/**
 * Authoritative Mongoose Model for multimodal media assets.
 * @type {import('mongoose').Model<IAsset>}
 */
export const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
