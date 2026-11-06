/**
 * @module modules/assets/services/assetService
 * @description Application domain service for asset persistence, lifecycle, and private storage integration.
 */

import fs from 'node:fs';
import { Asset } from '../persistence/Asset.js';
import { AssetRepresentation } from '../persistence/AssetRepresentation.js';
import * as storageService from '../storage/storageService.js';
import { assertUserOwnership, buildOwnerQuery } from '../../../infrastructure/security/userIsolation.js';
import { parseDocument } from '../../documents/ingestion/documentParser.js';
import { createCitation } from '../../documents/provenance/citationService.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/AppError.js';
import { ASSET_CONSTANTS } from '../../../utils/constants.js';
import { logger } from '../../../config/logger.js';

/**
 * Persists an uploaded temporary file into permanent private storage and records the Asset document.
 * Unlinks the temporary upload file once committed to private storage.
 *
 * @param {object} params
 * @param {object} params.user - Authenticated owner
 * @param {Express.Multer.File} params.file - Uploaded file from uploadMiddleware
 * @param {string} [params.purpose='attachment']
 * @param {string} [params.retentionPolicy='persistent']
 * @param {object} [params.metadata={}]
 * @returns {Promise<import('mongoose').HydratedDocument<any>>}
 */
export const createAssetFromUpload = async ({
  user,
  file,
  purpose = 'attachment',
  retentionPolicy = 'persistent',
  metadata = {},
}) => {
  if (!user || !user._id) {
    throw new BadRequestError('User context is required to store asset.', 'MISSING_USER');
  }
  if (!file || !file.path) {
    throw new BadRequestError('Upload file descriptor is required.', 'MISSING_FILE');
  }

  const userId = String(user._id);
  const stream = fs.createReadStream(file.path);

  let stored;
  try {
    stored = await storageService.writeStream({
      userId,
      originalName: file.originalname,
      mimeType: file.detectedMimeType || file.mimetype,
      readableStream: stream,
      maxSizeBytes: ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES,
    });
  } finally {
    // Always unlink temporary file after stream read
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        logger.warn(`Failed to clean up temp file post-stream: ${file.path}`, { error: err.message });
      }
    }
  }

  // 24-hour retention window for temporary retention policy per NFR-SEC-003
  const expiresAt =
    retentionPolicy === 'temporary'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null;

  const asset = await Asset.create({
    owner: user._id,
    originalName: stored.originalName,
    sanitizedName: stored.sanitizedName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
    storageProvider: 'local_disk',
    storageKey: stored.storageKey,
    storagePath: stored.storagePath,
    category: stored.category,
    purpose,
    status: 'ready',
    retentionPolicy,
    expiresAt,
    representations: {},
    metadata,
  });

  logger.info(`[assetService] Asset created: id=${asset._id}, key=${asset.storageKey}, owner=${userId}`);
  return asset;
};

/**
 * Creates multiple assets from a batch of uploaded files.
 * Provides atomic rollback if any individual asset ingestion fails.
 *
 * @param {object} params
 * @param {object} params.user
 * @param {Array<Express.Multer.File>} params.files
 * @param {string} [params.purpose='attachment']
 * @param {string} [params.retentionPolicy='persistent']
 * @returns {Promise<Array<import('mongoose').HydratedDocument<any>>>}
 */
export const createAssetsFromUploads = async ({
  user,
  files,
  purpose = 'attachment',
  retentionPolicy = 'persistent',
}) => {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new BadRequestError('No files provided in batch.', 'NO_FILES');
  }

  const createdAssets = [];

  try {
    for (const file of files) {
      const asset = await createAssetFromUpload({
        user,
        file,
        purpose,
        retentionPolicy,
      });
      createdAssets.push(asset);
    }
    return createdAssets;
  } catch (err) {
    // Rollback: clean up any assets that were already created in this batch
    logger.error('[assetService] Error during batch upload, rolling back created assets:', {
      error: err.message,
      createdCount: createdAssets.length,
    });

    for (const asset of createdAssets) {
      try {
        await storageService.deleteFile(asset.storageKey);
        await Asset.findByIdAndDelete(asset._id);
      } catch (cleanupErr) {
        logger.error(`[assetService] Rollback failure for asset ${asset._id}:`, { error: cleanupErr.message });
      }
    }

    throw err;
  }
};

/**
 * Retrieves an asset by ID enforcing user isolation (returns 404 for foreign or nonexistent assets).
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @returns {Promise<import('mongoose').HydratedDocument<any>>}
 */
export const getAssetById = async (assetId, userId, options = {}) => {
  const query = { _id: assetId };
  if (!options.includeDeleted) {
    query.isDeleted = false;
  }
  const asset = await Asset.findOne(query);
  return assertUserOwnership(asset, userId, 'owner');
};

/**
 * Lists assets for the authenticated owner with filtering and pagination.
 *
 * @param {object} params
 * @param {string | import('mongoose').Types.ObjectId} params.userId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.category]
 * @param {string} [params.purpose]
 * @param {string} [params.status]
 * @returns {Promise<{ assets: Array<any>, total: number, page: number, limit: number }>}
 */
export const listAssets = async ({
  userId,
  page = 1,
  limit = 20,
  category,
  purpose,
  status,
}) => {
  const query = buildOwnerQuery(userId, { isDeleted: { $ne: true } }, 'owner');

  if (category) query.category = category;
  if (purpose) query.purpose = purpose;
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [assets, total] = await Promise.all([
    Asset.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Asset.countDocuments(query),
  ]);

  return { assets, total, page, limit };
};

/**
 * Soft deletes an asset after verifying owner authorization.
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @returns {Promise<import('mongoose').HydratedDocument<any>>}
 */
export const deleteAsset = async (assetId, userId) => {
  const asset = await getAssetById(assetId, userId);
  await asset.softDelete();
  logger.info(`[assetService] Asset soft-deleted: id=${asset._id}, owner=${userId}`);
  return asset;
};

/**
 * Extracts and persists deterministic text representations for a document asset.
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @param {object} [options={}]
 * @returns {Promise<import('mongoose').HydratedDocument<any>>}
 */
export const extractAssetContent = async (assetId, userId, options = {}) => {
  const asset = await getAssetById(assetId, userId);

  // If already extracted and force is not specified, return existing representation
  if (asset.representations?.extractedText && !options.force) {
    return asset;
  }

  const filePath = storageService.resolveSafeStoragePath(asset.storageKey);
  const parsed = await parseDocument({
    filePath,
    mimeType: asset.mimeType,
    filename: asset.originalName,
    options,
  });

  asset.representations = {
    ...asset.representations,
    extractedText: parsed.text,
    textSnippet: parsed.preview,
    preview: parsed.preview,
    textExtractionStatus: parsed.isScanned ? 'none' : 'extracted',
    metadata: {
      pageCount: parsed.pageCount,
      sheetCount: parsed.sheetCount,
      format: parsed.format,
      charCount: parsed.charCount,
      isTruncated: parsed.isTruncated,
      isScanned: parsed.isScanned,
      extractedAt: new Date(),
    },
  };

  await asset.save();

  // Determine extraction engine identifier
  const engineMap = {
    pdf: 'pdf-parse',
    docx: 'mammoth',
    xlsx: 'exceljs',
    xls: 'exceljs',
    csv: 'exceljs',
    txt: 'plain-text',
    md: 'plain-text',
    markdown: 'plain-text',
    json: 'json-parser',
  };
  const engine = engineMap[parsed.format] || 'generic-parser';

  const baseProvenance = {
    pipeline: 'documentParser',
    engine,
    engineVersion: '1.0.0',
    sourceChecksum: asset.sha256,
    processedAt: new Date(),
    durationMs: parsed.durationMs || 0,
    isTruncated: Boolean(parsed.isTruncated),
    pageRange: parsed.pageCount
      ? { startPage: 1, endPage: parsed.pageCount, totalPages: parsed.pageCount }
      : { startPage: null, endPage: null, totalPages: null },
    sheetNames: parsed.sheetNames || [],
    metadata: {
      charCount: parsed.charCount,
      wordCount: parsed.wordCount,
      lineCount: parsed.lineCount,
      sheetCount: parsed.sheetCount,
      isScanned: Boolean(parsed.isScanned),
    },
  };

  // 1. Create primary extracted_text representation
  await AssetRepresentation.upsertRepresentation({
    owner: asset.owner,
    sourceAssetId: asset._id,
    representationType: 'extracted_text',
    content: parsed.text || '',
    mimeType: 'text/plain',
    provenance: baseProvenance,
    retentionRule: 'retain_after_binary_purge',
    status: 'ready',
  });

  // 2. If spreadsheet, also create structured spreadsheet_table representation
  if (parsed.format === 'xlsx' || parsed.format === 'xls' || parsed.format === 'csv') {
    await AssetRepresentation.upsertRepresentation({
      owner: asset.owner,
      sourceAssetId: asset._id,
      representationType: 'spreadsheet_table',
      content: parsed.preview || parsed.text,
      mimeType: 'text/markdown',
      provenance: {
        ...baseProvenance,
        pipeline: 'spreadsheetTableParser',
      },
      retentionRule: 'retain_after_binary_purge',
      status: 'ready',
    });
  }

  // 3. Create text_preview representation
  if (parsed.preview) {
    await AssetRepresentation.upsertRepresentation({
      owner: asset.owner,
      sourceAssetId: asset._id,
      representationType: 'text_preview',
      content: parsed.preview,
      mimeType: 'text/plain',
      provenance: {
        ...baseProvenance,
        pipeline: 'textSnippetPreview',
      },
      retentionRule: 'retain_after_binary_purge',
      status: 'ready',
    });
  }

  logger.info(
    `[assetService] Document text extracted and representations persisted: assetId=${asset._id}, format=${parsed.format}, chars=${parsed.charCount}`
  );
  return asset;
};

/**
 * Retrieves all active derived representations for an asset with strict owner isolation.
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @returns {Promise<Array<import('../persistence/AssetRepresentation.js').AssetRepresentation>>}
 */
export const getAssetRepresentations = async (assetId, userId) => {
  const asset = await getAssetById(assetId, userId);
  return AssetRepresentation.find({
    sourceAssetId: asset._id,
    owner: asset.owner,
    isDeleted: false,
  }).sort({ createdAt: 1 });
};

/**
 * Retrieves a specific representation for an asset by type with owner isolation.
 *
 * @param {string} assetId
 * @param {string} representationType
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @returns {Promise<import('../persistence/AssetRepresentation.js').AssetRepresentation>}
 */
export const getAssetRepresentationByType = async (assetId, representationType, userId) => {
  const asset = await getAssetById(assetId, userId);
  const rep = await AssetRepresentation.findOne({
    sourceAssetId: asset._id,
    owner: asset.owner,
    representationType,
    isDeleted: false,
  });

  if (!rep) {
    throw new NotFoundError(
      `Representation of type "${representationType}" not found for asset ${assetId}.`,
      'REPRESENTATION_NOT_FOUND'
    );
  }

  return rep;
};

/**
 * Reconciles physical binary file purge while retaining Asset metadata and derived
 * representations for ongoing conversational reasoning (Scenario M, FR-CORE-DOC-003).
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @returns {Promise<import('../persistence/Asset.js').Asset>}
 */
export const purgeAssetBinary = async (assetId, userId) => {
  const asset = await getAssetById(assetId, userId);

  // If binary is already purged, return existing state
  if (asset.hasBinaryPurged) {
    return asset;
  }

  // Delete physical storage file if present
  try {
    await storageService.deleteFile(asset.storageKey);
  } catch (err) {
    logger.warn(`[assetService] Storage deletion during binary purge: ${err.message}`);
  }

  // Update asset and representations
  await asset.purgeBinary();
  logger.info(`[assetService] Asset binary purged, representations retained: assetId=${asset._id}`);
  return asset;
};

/**
 * Generates an immutable, verified citation for an asset and its derived representation.
 *
 * @param {string} assetId
 * @param {string | import('mongoose').Types.ObjectId} userId
 * @param {object} citationParams
 * @returns {Promise<object>} Citation object
 */
export const generateAssetCitation = async (assetId, userId, { representationType, location = {}, snippet = '' } = {}) => {
  const asset = await getAssetById(assetId, userId);
  let representation = null;

  if (representationType) {
    representation = await AssetRepresentation.findOne({
      sourceAssetId: asset._id,
      owner: asset.owner,
      representationType,
      isDeleted: false,
    });
  }

  return createCitation({
    asset,
    representation,
    location,
    snippet,
  });
};
