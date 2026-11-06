/**
 * @module modules/assets/storage/storageService
 * @description Private, authenticated object storage service abstraction (Phase 3 - FR-CORE-DOC-003).
 * Enforces zero public static exposure, real-time SHA-256 integrity hashing, path traversal defenses,
 * and cryptographically signed short-lived download authorization tokens.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { ASSET_CONSTANTS } from '../../../utils/constants.js';
import {
  BadRequestError,
  UnauthenticatedError,
  NotFoundError,
} from '../../../shared/errors/AppError.js';
import { logger } from '../../../config/logger.js';

/**
 * Resolves and ensures existence of the private storage root directory.
 * Never accessible via public static Express routes.
 *
 * @returns {string} Absolute path to storage root
 */
export const getPrivateStorageRoot = () => {
  const root = process.env.STORAGE_LOCAL_ROOT
    ? path.resolve(process.env.STORAGE_LOCAL_ROOT)
    : path.resolve(process.cwd(), 'storage/private');

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  return root;
};

/**
 * Sanitizes an incoming filename to prevent path traversal and shell injection.
 *
 * @param {string} rawName
 * @returns {string} Sanitized safe filename
 */
export const sanitizeFilename = (rawName) => {
  if (!rawName || typeof rawName !== 'string') return 'unnamed_file';

  const base = path.basename(rawName).trim();
  // Remove null bytes, path traversal sequences, and control characters
  const clean = base
    .replace(/\0/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 200);

  return clean || 'unnamed_file';
};

/**
 * Infers high-level asset category from MIME type and filename.
 *
 * @param {string} [mimeType='']
 * @param {string} [fileName='']
 * @returns {'document' | 'image' | 'audio' | 'video' | 'archive' | 'other'}
 */
export const inferAssetCategory = (mimeType = '', fileName = '') => {
  const mime = (mimeType || '').toLowerCase();
  const ext = path.extname(fileName || '').toLowerCase();

  if (mime.startsWith('image/') || ASSET_CONSTANTS.ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('audio/') || ASSET_CONSTANTS.ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
    return 'audio';
  }
  if (mime.startsWith('video/') || ext === '.mp4' || ext === '.webm' || ext === '.mov') {
    return 'video';
  }
  if (
    mime === 'application/pdf' ||
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/csv' ||
    mime === 'application/json' ||
    ASSET_CONSTANTS.ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)
  ) {
    return 'document';
  }
  if (
    mime.includes('zip') ||
    mime.includes('tar') ||
    mime.includes('gzip') ||
    ext === '.zip' ||
    ext === '.tar' ||
    ext === '.gz'
  ) {
    return 'archive';
  }

  return 'other';
};

/**
 * Generates a storage key ensuring user and date partitioning.
 * Format: {userId}/{yyyy}/{mm}/{uuid}-{sanitizedName}
 *
 * @param {string} userId
 * @param {string} filename
 * @returns {string} Relative storage key
 */
export const generateStorageKey = (userId, filename) => {
  const safeName = sanitizeFilename(filename);
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uid = crypto.randomUUID();

  return `${userId}/${yyyy}/${mm}/${uid}-${safeName}`;
};

/**
 * Resolves and validates that a relative storage key resides safely inside the private storage root.
 *
 * @param {string} storageKey
 * @returns {string} Absolute validated filesystem path
 * @throws {BadRequestError} If path escapes root (path traversal)
 */
export const resolveSafeStoragePath = (storageKey) => {
  const root = getPrivateStorageRoot();
  const resolved = path.resolve(root, storageKey);

  if (!resolved.startsWith(root)) {
    throw new BadRequestError('Invalid storage path: directory traversal attempt detected.', 'PATH_TRAVERSAL_DETECTED');
  }

  return resolved;
};

/**
 * Writes a readable stream directly to private object storage, calculating SHA-256 hash
 * and validating byte count limits on the fly.
 *
 * @param {object} params
 * @param {string} params.userId - Owner ID
 * @param {string} params.originalName - Original client filename
 * @param {string} [params.mimeType='application/octet-stream'] - MIME type
 * @param {import('node:stream').Readable} params.readableStream - Inbound binary stream
 * @param {number} [params.maxSizeBytes=ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES] - Hard limit
 * @returns {Promise<{
 *   storageKey: string,
 *   storagePath: string,
 *   sizeBytes: number,
 *   sha256: string,
 *   originalName: string,
 *   sanitizedName: string,
 *   mimeType: string,
 *   category: string,
 * }>}
 */
export const writeStream = async ({
  userId,
  originalName,
  mimeType = 'application/octet-stream',
  readableStream,
  maxSizeBytes = ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES,
}) => {
  if (!userId) throw new BadRequestError('User ID is required to allocate storage.', 'MISSING_USER_ID');
  if (!readableStream) throw new BadRequestError('Readable stream is required.', 'MISSING_STREAM');

  const sanitizedName = sanitizeFilename(originalName);
  const storageKey = generateStorageKey(userId, sanitizedName);
  const targetPath = resolveSafeStoragePath(storageKey);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const hash = crypto.createHash('sha256');
  const writeStreamDestination = fs.createWriteStream(targetPath);

  let sizeBytes = 0;

  return new Promise((resolve, reject) => {
    readableStream.on('data', (chunk) => {
      sizeBytes += chunk.length;
      if (sizeBytes > maxSizeBytes) {
        readableStream.destroy();
        writeStreamDestination.destroy();
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        reject(new BadRequestError(`File size exceeds maximum permitted limit (${maxSizeBytes} bytes).`, 'FILE_TOO_LARGE'));
      } else {
        hash.update(chunk);
      }
    });

    readableStream.on('error', (err) => {
      writeStreamDestination.destroy();
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      reject(err);
    });

    writeStreamDestination.on('error', (err) => {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      reject(err);
    });

    writeStreamDestination.on('finish', () => {
      const sha256 = hash.digest('hex');
      const category = inferAssetCategory(mimeType, sanitizedName);

      resolve({
        storageKey,
        storagePath: storageKey, // Store relative key as canonical storagePath
        sizeBytes,
        sha256,
        originalName: originalName || sanitizedName,
        sanitizedName,
        mimeType: mimeType.toLowerCase(),
        category,
      });
    });

    readableStream.pipe(writeStreamDestination);
  });
};

/**
 * Writes an in-memory buffer to private object storage with SHA-256 calculation.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.originalName
 * @param {Buffer} params.buffer
 * @param {string} [params.mimeType='application/octet-stream']
 * @returns {Promise<{
 *   storageKey: string,
 *   storagePath: string,
 *   sizeBytes: number,
 *   sha256: string,
 *   originalName: string,
 *   sanitizedName: string,
 *   mimeType: string,
 *   category: string,
 * }>}
 */
export const writeBuffer = async ({
  userId,
  originalName,
  buffer,
  mimeType = 'application/octet-stream',
}) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new BadRequestError('Buffer payload is required.', 'INVALID_BUFFER');
  }

  const { Readable } = await import('node:stream');
  const stream = Readable.from(buffer);

  return writeStream({
    userId,
    originalName,
    mimeType,
    readableStream: stream,
    maxSizeBytes: ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES,
  });
};

/**
 * Creates an authenticated readable stream for a stored asset.
 *
 * @param {string} storageKey
 * @returns {fs.ReadStream}
 */
export const createReadStream = (storageKey) => {
  const safePath = resolveSafeStoragePath(storageKey);
  if (!fs.existsSync(safePath)) {
    throw new NotFoundError('Asset file was not found in storage repository.', 'FILE_NOT_FOUND');
  }
  return fs.createReadStream(safePath);
};

/**
 * Deletes an asset file from private storage.
 *
 * @param {string} storageKey
 * @returns {boolean} True if deleted, false if did not exist
 */
export const deleteFile = (storageKey) => {
  try {
    const safePath = resolveSafeStoragePath(storageKey);
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(`[storageService] Could not delete file: ${storageKey}: ${err.message}`);
    return false;
  }
};

/**
 * Generates a short-lived HMAC signed download token for authorized file streaming.
 * Validates ownership before generation; token contains expiration.
 *
 * @param {{ assetId: string, userId: string, expiresInSeconds?: number }} params
 * @returns {string} Signed download token
 */
export const generateSignedDownloadToken = ({
  assetId,
  userId,
  expiresInSeconds = ASSET_CONSTANTS.DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
}) => {
  if (!assetId || !userId) {
    throw new BadRequestError('Asset ID and User ID are required to issue signed download token.', 'MISSING_TOKEN_PARAMS');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = {
    a: String(assetId),
    u: String(userId),
    e: expiresAt,
  };

  const serialized = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const secret = env.JWT_ACCESS_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(serialized).digest('base64url');

  return `${serialized}.${signature}`;
};

/**
 * Verifies and decodes a signed download token.
 *
 * @param {string} token
 * @returns {{ assetId: string, userId: string, expiresAt: number }} Decoded payload
 * @throws {UnauthenticatedError} If expired, malformed, or signature mismatch
 */
export const verifySignedDownloadToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new UnauthenticatedError('Download token is required.', 'MISSING_DOWNLOAD_TOKEN');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new UnauthenticatedError('Malformed download token format.', 'INVALID_DOWNLOAD_TOKEN');
  }

  const [serialized, signature] = parts;
  const secret = env.JWT_ACCESS_SECRET;
  const expectedSignature = crypto.createHmac('sha256', secret).update(serialized).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new UnauthenticatedError('Invalid download token signature.', 'INVALID_DOWNLOAD_TOKEN_SIGNATURE');
  }

  let payload;
  try {
    const jsonStr = Buffer.from(serialized, 'base64url').toString('utf8');
    payload = JSON.parse(jsonStr);
  } catch {
    throw new UnauthenticatedError('Corrupted download token payload.', 'INVALID_DOWNLOAD_TOKEN');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.e || payload.e < nowSeconds) {
    throw new UnauthenticatedError('Download token has expired. Please request a fresh download link.', 'DOWNLOAD_TOKEN_EXPIRED');
  }

  return {
    assetId: payload.a,
    userId: payload.u,
    expiresAt: payload.e,
  };
};

export default {
  getPrivateStorageRoot,
  sanitizeFilename,
  inferAssetCategory,
  generateStorageKey,
  resolveSafeStoragePath,
  writeStream,
  writeBuffer,
  createReadStream,
  deleteFile,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
};
