/**
 * @module modules/assets/http/assetController
 * @description HTTP controllers for private asset ingestion, listing, and lifecycle operations.
 */

import * as assetService from '../services/assetService.js';
import { HTTP_STATUS } from '../../../utils/constants.js';
import { BadRequestError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../infrastructure/http/middleware/asyncHandler.js';

/**
 * Maps an internal Asset document into a safe external client DTO.
 * Excludes raw filesystem paths and internal storage keys.
 *
 * @param {import('mongoose').HydratedDocument<any>} asset
 */
export const formatAssetResponse = (asset) => ({
  id: asset._id,
  originalName: asset.originalName,
  sanitizedName: asset.sanitizedName,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  category: asset.category,
  purpose: asset.purpose,
  status: asset.status,
  retentionPolicy: asset.retentionPolicy,
  sha256: asset.sha256,
  expiresAt: asset.expiresAt,
  representations: asset.representations || {},
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
});

/**
 * Handles single and multi-file asset uploads.
 * Route: POST /api/v1/assets/upload
 */
export const uploadAsset = asyncHandler(async (req, res) => {
  const rawFiles = req.uploadedFiles || (req.files ? Object.values(req.files).flat() : (req.file ? [req.file] : []));

  if (!rawFiles || rawFiles.length === 0) {
    throw new BadRequestError('No files were provided in the upload request.', 'NO_FILE_PROVIDED');
  }

  const purpose = req.body.purpose || 'attachment';
  const retentionPolicy = req.body.retentionPolicy || 'persistent';

  if (rawFiles.length > 1) {
    const assets = await assetService.createAssetsFromUploads({
      user: req.user,
      files: rawFiles,
      purpose,
      retentionPolicy,
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Successfully uploaded ${assets.length} assets.`,
      data: {
        assets: assets.map(formatAssetResponse),
      },
    });
  }

  const asset = await assetService.createAssetFromUpload({
    user: req.user,
    file: rawFiles[0],
    purpose,
    retentionPolicy,
  });

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Asset uploaded successfully.',
    data: {
      asset: formatAssetResponse(asset),
    },
  });
});

/**
 * Retrieves asset metadata by ID.
 * Route: GET /api/v1/assets/:id
 */
export const getAsset = asyncHandler(async (req, res) => {
  const asset = await assetService.getAssetById(req.params.id, req.user._id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      asset: formatAssetResponse(asset),
    },
  });
});

/**
 * Lists assets for the authenticated owner with filtering and pagination.
 * Route: GET /api/v1/assets
 */
export const listAssets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { category, purpose, status } = req.query;

  const result = await assetService.listAssets({
    userId: req.user._id,
    page,
    limit,
    category,
    purpose,
    status,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      assets: result.assets.map(formatAssetResponse),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    },
  });
});

/**
 * Soft deletes an asset after verifying ownership.
 * Route: DELETE /api/v1/assets/:id
 */
export const deleteAsset = asyncHandler(async (req, res) => {
  await assetService.deleteAsset(req.params.id, req.user._id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Asset deleted successfully.',
  });
});

/**
 * Parses and extracts text representation from a stored document.
 * Route: POST /api/v1/assets/:id/extract
 */
export const extractAssetContent = asyncHandler(async (req, res) => {
  const asset = await assetService.extractAssetContent(req.params.id, req.user._id, {
    force: req.query.force === 'true',
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Document text extracted successfully.',
    data: {
      asset: formatAssetResponse(asset),
      extraction: asset.representations,
    },
  });
});
