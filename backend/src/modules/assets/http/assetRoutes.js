/**
 * @module modules/assets/http/assetRoutes
 * @description API v1 routes for asset ingestion, inspection, and management.
 */

import { Router } from 'express';
import { requireUser, optionalUser } from '../../../infrastructure/http/middleware/requireUser.js';
import { uploadMultipleAssets } from './uploadMiddleware.js';
import * as assetController from './assetController.js';

const router = Router();

/**
 * @route GET /api/v1/assets/:id/download
 * @desc Download raw private asset binary via HMAC signed token (?token=...) or active session
 */
router.get('/:id/download', optionalUser, assetController.downloadAsset);

// Enforce session authentication on all management endpoints
router.use(requireUser);

/**
 * @route GET /api/v1/assets/:id/token
 * @desc Generate an authenticated, short-lived signed download token
 */
router.get('/:id/token', assetController.getDownloadToken);

/**
 * @route POST /api/v1/assets/upload
 * @desc Ingest single or multi-part assets (max 50MB, max 5 files)
 */
router.post('/upload', uploadMultipleAssets, assetController.uploadAsset);

/**
 * @route GET /api/v1/assets
 * @desc List assets owned by the authenticated user
 */
router.get('/', assetController.listAssets);

/**
 * @route GET /api/v1/assets/:id
 * @desc Get asset metadata by ID
 */
router.get('/:id', assetController.getAsset);

/**
 * @route POST /api/v1/assets/:id/extract
 * @desc Parse and extract text representation from document asset
 */
router.post('/:id/extract', assetController.extractAssetContent);

/**
 * @route GET /api/v1/assets/:id/representations
 * @desc Get all derived representations for an asset with full provenance
 */
router.get('/:id/representations', assetController.getAssetRepresentations);

/**
 * @route GET /api/v1/assets/:id/representations/:type
 * @desc Get a specific representation for an asset by type
 */
router.get('/:id/representations/:type', assetController.getAssetRepresentationByType);

/**
 * @route POST /api/v1/assets/:id/purge-binary
 * @desc Purge physical binary from storage while retaining representations (Scenario M)
 */
router.post('/:id/purge-binary', assetController.purgeAssetBinary);

/**
 * @route POST /api/v1/assets/:id/citations
 * @desc Generate an immutable, verified citation for an asset
 */
router.post('/:id/citations', assetController.createAssetCitation);

/**
 * @route DELETE /api/v1/assets/:id
 * @desc Soft delete an asset
 */
router.delete('/:id', assetController.deleteAsset);

export default router;
