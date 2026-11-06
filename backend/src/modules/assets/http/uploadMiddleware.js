/**
 * @module modules/assets/http/uploadMiddleware
 * @description Centralized streaming multipart upload middleware.
 * Enforces private staging directories, file size limits, MIME magic-byte sniffing,
 * batch limits, and safe cleanup of rejected or orphaned files.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { ASSET_CONSTANTS, AUDIO_CONSTANTS, ATTACHMENT_CONSTANTS } from '../../../utils/constants.js';
import { getPrivateTempRoot, inferAssetCategory } from '../storage/storageService.js';
import { sniffMimeType } from '../validation/mimeSniffer.js';
import { BadRequestError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../config/logger.js';

/**
 * Cleanly unlinks an array of uploaded Multer file objects from the filesystem.
 *
 * @param {Array<Express.Multer.File> | Express.Multer.File} files
 */
export const cleanupUploadedFiles = (files) => {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const f of list) {
    if (f && f.path && fs.existsSync(f.path)) {
      try {
        fs.unlinkSync(f.path);
      } catch (err) {
        logger.warn(`Failed to cleanup temp file: ${f.path}`, { error: err.message });
      }
    }
  }
};

/**
 * Multer disk storage engine placing incoming chunks into the isolated private temp staging root.
 */
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      const tempDir = getPrivateTempRoot();
      cb(null, tempDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const tempName = `upload-${crypto.randomUUID()}${ext}.tmp`;
    cb(null, tempName);
  },
});

/**
 * Preliminary extension filter as first line of defense before streaming starts.
 */
const extensionFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [
    ...ASSET_CONSTANTS.ALLOWED_DOCUMENT_EXTENSIONS,
    ...ASSET_CONSTANTS.ALLOWED_IMAGE_EXTENSIONS,
    ...ASSET_CONSTANTS.ALLOWED_AUDIO_EXTENSIONS,
  ];

  if (!ext || !allowed.includes(ext)) {
    return cb(
      new BadRequestError(
        `Unsupported file extension "${ext || 'none'}". Allowed formats: ${allowed.join(', ')}.`,
        'UNSUPPORTED_FILE_TYPE'
      )
    );
  }

  cb(null, true);
};

/**
 * Configured Multer instance for asset uploads.
 */
const assetUploader = multer({
  storage: diskStorage,
  fileFilter: extensionFilter,
  limits: {
    fileSize: ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES,
    files: ASSET_CONSTANTS.MAX_BATCH_FILES,
  },
});

/**
 * Post-processes uploaded files: validates sizes, checks batch sums, and executes magic-byte sniffing.
 *
 * @param {Array<Express.Multer.File>} files
 * @param {number} [maxBatchBytes=ASSET_CONSTANTS.MAX_BATCH_SIZE_BYTES]
 */
const postProcessUploadedFiles = (files, maxBatchBytes = ASSET_CONSTANTS.MAX_BATCH_SIZE_BYTES) => {
  if (!files || files.length === 0) {
    throw new BadRequestError('No files were provided in the upload request.', 'NO_FILE_PROVIDED');
  }

  let totalSize = 0;

  for (const file of files) {
    if (!file.path || !fs.existsSync(file.path)) {
      throw new BadRequestError(`File "${file.originalname}" was not written to storage.`, 'UPLOAD_WRITE_FAILED');
    }

    if (file.size === 0) {
      throw new BadRequestError(`Uploaded file "${file.originalname}" is empty (0 bytes).`, 'EMPTY_FILE');
    }

    totalSize += file.size;

    // Read header bytes (first 8KB) to perform magic-byte sniffing
    let headerBuffer;
    try {
      const fd = fs.openSync(file.path, 'r');
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      headerBuffer = buf.subarray(0, bytesRead);
    } catch (err) {
      throw new BadRequestError(`Failed to inspect file "${file.originalname}": ${err.message}`, 'FILE_READ_ERROR');
    }

    // Sniff actual MIME type against magic bytes
    const verifiedMime = sniffMimeType(headerBuffer, file.originalname, file.mimetype);
    file.detectedMimeType = verifiedMime;
    file.category = inferAssetCategory(verifiedMime, file.originalname);
  }

  if (totalSize > maxBatchBytes) {
    throw new BadRequestError(
      `Cumulative upload batch size (${Math.round(totalSize / (1024 * 1024))}MB) exceeds maximum limit (${maxBatchBytes / (1024 * 1024)}MB).`,
      'FILE_TOO_LARGE'
    );
  }
};

/**
 * Normalized error mapper for Multer exceptions.
 *
 * @param {Error} err
 * @param {Array<Express.Multer.File>} files
 * @param {import('express').NextFunction} next
 */
const handleUploadError = (err, files, next) => {
  cleanupUploadedFiles(files);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new BadRequestError(
          `File exceeds the maximum permitted limit of ${ASSET_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
          'FILE_TOO_LARGE'
        )
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(
        new BadRequestError(
          `Cannot upload more than ${ASSET_CONSTANTS.MAX_BATCH_FILES} files in a single request.`,
          'LIMIT_FILE_COUNT'
        )
      );
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(
        new BadRequestError(
          `Unexpected upload field "${err.field}".`,
          'UNEXPECTED_FIELD'
        )
      );
    }
    return next(new BadRequestError(`Upload error: ${err.message}`, 'UPLOAD_ERROR'));
  }

  return next(err);
};

/**
 * Middleware handling single or multi-file uploads across supported field names.
 * Accepts: 'file', 'files', 'attachment', 'attachments', 'audio', 'audios'.
 *
 * @function uploadMultipleAssets
 */
export const uploadMultipleAssets = (req, res, next) => {
  const uploader = assetUploader.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: ASSET_CONSTANTS.MAX_BATCH_FILES },
    { name: 'attachment', maxCount: 1 },
    { name: 'attachments', maxCount: ASSET_CONSTANTS.MAX_BATCH_FILES },
    { name: 'audio', maxCount: 1 },
    { name: 'audios', maxCount: ASSET_CONSTANTS.MAX_BATCH_FILES },
  ]);

  uploader(req, res, (err) => {
    const rawFiles = req.files
      ? Object.values(req.files).flat()
      : req.file
      ? [req.file]
      : [];

    if (err) {
      return handleUploadError(err, rawFiles, next);
    }

    if (rawFiles.length === 0) {
      return next(new BadRequestError('No files were provided in the upload request.', 'NO_FILE_PROVIDED'));
    }

    try {
      postProcessUploadedFiles(rawFiles);
      req.uploadedFiles = rawFiles;
      req.file = rawFiles[0];
      req.files = rawFiles;
      return next();
    } catch (processErr) {
      return handleUploadError(processErr, rawFiles, next);
    }
  });
};

/**
 * Middleware handling a single asset upload.
 *
 * @function uploadSingleAsset
 */
export const uploadSingleAsset = (req, res, next) => {
  const uploader = assetUploader.fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachment', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]);

  uploader(req, res, (err) => {
    const rawFiles = req.files
      ? Object.values(req.files).flat()
      : req.file
      ? [req.file]
      : [];

    if (err) {
      return handleUploadError(err, rawFiles, next);
    }

    if (rawFiles.length === 0) {
      return next(new BadRequestError('No file was provided in the upload request.', 'NO_FILE_PROVIDED'));
    }

    try {
      postProcessUploadedFiles(rawFiles);
      req.file = rawFiles[0];
      req.uploadedFiles = [req.file];
      return next();
    } catch (processErr) {
      return handleUploadError(processErr, rawFiles, next);
    }
  });
};

/**
 * Legacy compatibility middleware for single audio recording ingestion.
 *
 * @function uploadSingleAudioMiddleware
 */
export const uploadSingleAudioMiddleware = uploadSingleAsset;

/**
 * Legacy compatibility middleware for report multi-audio ingestion.
 *
 * @function uploadReportAudiosMiddleware
 */
export const uploadReportAudiosMiddleware = uploadMultipleAssets;

/**
 * Legacy compatibility middleware for chat multi-attachment ingestion.
 *
 * @function uploadChatAttachmentsMiddleware
 */
export const uploadChatAttachmentsMiddleware = uploadMultipleAssets;
