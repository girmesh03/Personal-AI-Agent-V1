/**
 * @module modules/assets/http/assetRoutes
 * @description API v1 routes for asset ingestion, inspection, and management.
 */

import { Router } from 'express';
import { requireUser } from '../../../infrastructure/http/middleware/requireUser.js';
import { csrfProtection } from '../../../infrastructure/http/middleware/csrfProtection.js';
import { uploadMultipleAssets } from './uploadMiddleware.js';
import * as assetController from './assetController.js';

const router = Router();

// Enforce authentication on all asset endpoints
router.use(requireUser);

/**
 * @route POST /api/v1/assets/upload
 * @desc Ingest single or multi-part assets (max 50MB, max 5 files)
 */
router.post('/upload', csrfProtection, uploadMultipleAssets, assetController.uploadAsset);

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
 * @route DELETE /api/v1/assets/:id
 * @desc Soft delete an asset
 */
router.delete('/:id', csrfProtection, assetController.deleteAsset);

export default router;
