/**
 * @module modules/assets/lifecycle/assetReconciliationService
 * @description Background lifecycle sweeper and reconciliation engine for private assets (FR-CORE-DOC-003, Scenarios M & O).
 * Reconciles ephemeral asset expiry, purges physical binary files while retaining derived representations,
 * cleans up abandoned multipart staging buffers, and ensures database-storage consistency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Asset } from '../persistence/Asset.js';
import * as storageService from '../storage/storageService.js';
import { purgeAssetBinary } from '../services/assetService.js';
import { logger } from '../../../config/logger.js';

/**
 * Sweeps and reconciles expired ephemeral assets.
 * Purges physical binary files from disk while preserving Asset documents and
 * derived representations for ongoing conversational reasoning (Scenario M, FR-CORE-DOC-003).
 *
 * @param {object} [options={}]
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<{ scanned: number, purged: number, errors: Array<{ assetId: string, error: string }> }>}
 */
export const reconcileExpiredAssets = async (options = {}) => {
  const cutoff = options.now || new Date();

  // Find all active assets past expiry that still have their physical binary on disk
  const expiredAssets = await Asset.find({
    retentionPolicy: { $in: ['temporary', 'ephemeral'] },
    expiresAt: { $lte: cutoff },
    hasBinaryPurged: false,
    isDeleted: false,
  });

  const result = {
    scanned: expiredAssets.length,
    purged: 0,
    errors: [],
  };

  for (const asset of expiredAssets) {
    try {
      await purgeAssetBinary(asset._id, asset.owner);
      result.purged += 1;
    } catch (err) {
      logger.error(`[assetReconciliation] Failed to purge binary for expired asset ${asset._id}:`, {
        error: err.message,
      });
      result.errors.push({ assetId: asset._id.toString(), error: err.message });
    }
  }

  if (result.purged > 0) {
    logger.info(
      `[assetReconciliation] Expired asset sweep completed: scanned=${result.scanned}, purged=${result.purged}, errors=${result.errors.length}`
    );
  }

  return result;
};

/**
 * Sweeps and unlinks abandoned temporary upload chunks from the staging directory.
 * Interrupted or aborted uploads older than maxAgeMs are safely deleted (Scenario O).
 *
 * @param {number} [maxAgeMs=3600000] - Default: 1 hour
 * @returns {Promise<{ scanned: number, unlinked: number, reclaimedBytes: number }>}
 */
export const reconcileOrphanedTempFiles = async (maxAgeMs = 3600000) => {
  const tempDir = storageService.getTempStorageRoot();
  const result = { scanned: 0, unlinked: 0, reclaimedBytes: 0 };

  if (!fs.existsSync(tempDir)) {
    return result;
  }

  const now = Date.now();
  let entries;
  try {
    entries = fs.readdirSync(tempDir);
  } catch (err) {
    logger.warn(`[assetReconciliation] Failed to read temp directory: ${err.message}`);
    return result;
  }

  for (const file of entries) {
    const fullPath = path.join(tempDir, file);
    try {
      const stats = fs.statSync(fullPath);
      result.scanned += 1;

      if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
        const bytes = stats.size;
        fs.unlinkSync(fullPath);
        result.unlinked += 1;
        result.reclaimedBytes += bytes;
      }
    } catch (_err) {
      // Non-fatal if file was deleted concurrently
    }
  }

  if (result.unlinked > 0) {
    logger.info(
      `[assetReconciliation] Orphaned temp sweep: unlinked=${result.unlinked}, reclaimedBytes=${result.reclaimedBytes}`
    );
  }

  return result;
};

export default {
  reconcileExpiredAssets,
  reconcileOrphanedTempFiles,
};
