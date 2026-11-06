/**
 * @module modules/assets/services/assetService
 * @description Application domain service for asset persistence, lifecycle, and private storage integration.
 */

import fs from 'node:fs';
import { Asset } from '../persistence/Asset.js';
import * as storageService from '../storage/storageService.js';
import { assertUserOwnership, buildOwnerQuery } from '../../../infrastructure/security/userIsolation.js';
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
export const getAssetById = async (assetId, userId) => {
  const asset = await Asset.findById(assetId);
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
