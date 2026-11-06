/**
 * @file tests/api/storage-asset.test.js
 * @description Unit and integration tests for Private Object Storage Abstraction and Unified Asset Model (Task 3.1 - FR-CORE-DOC-003).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import { Audio } from '../../backend/src/models/Audio.js';
import {
  getPrivateStorageRoot,
  sanitizeFilename,
  inferAssetCategory,
  generateStorageKey,
  resolveSafeStoragePath,
  writeBuffer,
  writeStream,
  createReadStream,
  deleteFile,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
} from '../../backend/src/modules/assets/storage/storageService.js';
import { assertUserOwnership } from '../../backend/src/infrastructure/security/userIsolation.js';
import { NotFoundError, BadRequestError } from '../../backend/src/shared/errors/AppError.js';

describe('Private Object Storage & Asset Metadata Models (Task 3.1 - FR-CORE-DOC-003)', () => {
  let testUser;
  let foreignUser;
  const createdStorageKeys = [];

  before(async () => {
    await connectDB();

    testUser = await User.create({
      firstName: 'Storage',
      lastName: 'Owner',
      email: `storage.test.${Date.now()}@example.com`,
      password: 'Password123!@',
      position: 'Storage Architect',
    });

    foreignUser = await User.create({
      firstName: 'Foreign',
      lastName: 'Intruder',
      email: `foreign.test.${Date.now()}@example.com`,
      password: 'Password123!@',
      position: 'Auditor',
    });
  });

  after(async () => {
    // Clean up created files on disk
    for (const key of createdStorageKeys) {
      deleteFile(key);
    }

    if (testUser?._id) {
      await User.findByIdAndDelete(testUser._id);
      await Asset.deleteMany({ owner: testUser._id });
    }
    if (foreignUser?._id) {
      await User.findByIdAndDelete(foreignUser._id);
      await Asset.deleteMany({ owner: foreignUser._id });
    }
    await disconnectDB();
  });

  describe('1. Storage Abstraction Primitives & Defenses', () => {
    it('ensures private storage root is distinct and exists on disk', () => {
      const root = getPrivateStorageRoot();
      assert.ok(fs.existsSync(root), 'Private storage root must physically exist');
      // Must not be under public web directory
      assert.ok(!root.includes(path.join('client', 'dist')), 'Storage root must not be inside client dist');
      assert.ok(!root.includes(path.join('backend', 'public')), 'Storage root must not be inside public');
    });

    it('sanitizes malicious filenames preventing path traversal and null bytes', () => {
      assert.equal(sanitizeFilename('../../../etc/passwd'), 'passwd');
      assert.equal(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
      assert.equal(sanitizeFilename('report\0.pdf'), 'report.pdf');
      assert.equal(sanitizeFilename('my report (final) [v2]!.pdf'), 'my_report__final___v2__.pdf');
      assert.equal(sanitizeFilename(''), 'unnamed_file');
    });

    it('accurately infers media category across documents, images, audio, and archives', () => {
      assert.equal(inferAssetCategory('application/pdf', 'doc.pdf'), 'document');
      assert.equal(inferAssetCategory('image/png', 'photo.png'), 'image');
      assert.equal(inferAssetCategory('audio/wav', 'voice.wav'), 'audio');
      assert.equal(inferAssetCategory('video/mp4', 'clip.mp4'), 'video');
      assert.equal(inferAssetCategory('application/zip', 'backup.zip'), 'archive');
      assert.equal(inferAssetCategory('application/octet-stream', 'unknown.bin'), 'other');
    });

    it('generates partition-structured storage keys bound to user ID', () => {
      const key = generateStorageKey(testUser._id.toString(), 'analysis.pdf');
      assert.ok(key.startsWith(`${testUser._id.toString()}/`));
      assert.ok(key.endsWith('-analysis.pdf'));
    });

    it('resolves safe storage paths and rejects path traversal escapes', () => {
      const safeKey = `${testUser._id}/2026/11/safe-file.txt`;
      const resolved = resolveSafeStoragePath(safeKey);
      assert.ok(resolved.startsWith(getPrivateStorageRoot()));

      // Traversal attempt
      assert.throws(
        () => resolveSafeStoragePath('../../outside-root.txt'),
        /Invalid storage path: directory traversal attempt detected/
      );
    });
  });

  describe('2. Streaming Storage Operations & SHA-256 Hashing', () => {
    it('writes buffer to private disk, computes accurate SHA-256 hash, and reads stream back', async () => {
      const content = Buffer.from('Operon private confidential report contents: Hello V1 World!', 'utf8');
      const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');

      const result = await writeBuffer({
        userId: testUser._id.toString(),
        originalName: 'confidential-report.txt',
        buffer: content,
        mimeType: 'text/plain',
      });

      createdStorageKeys.push(result.storageKey);

      assert.equal(result.sizeBytes, content.length);
      assert.equal(result.sha256, expectedSha256);
      assert.equal(result.category, 'document');

      // Verify physical existence
      const stream = createReadStream(result.storageKey);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const readContent = Buffer.concat(chunks);
      assert.equal(readContent.toString('utf8'), content.toString('utf8'));
    });

    it('rejects streams that exceed configured byte limits, aborting and unlinking partial files', async () => {
      const hugeBuffer = Buffer.alloc(1024 * 1024, 'A'); // 1MB
      const stream = Readable.from(hugeBuffer);

      await assert.rejects(
        async () => {
          await writeStream({
            userId: testUser._id.toString(),
            originalName: 'too-big.dat',
            readableStream: stream,
            maxSizeBytes: 100 * 1024, // 100KB limit
          });
        },
        (err) => err instanceof BadRequestError && err.errorCode === 'FILE_TOO_LARGE'
      );
    });
  });

  describe('3. Signed Download Token Security', () => {
    const assetId = '60d5ec49f1b2c8b1f8e4e999';

    it('generates and verifies short-lived HMAC-signed download tokens', () => {
      const token = generateSignedDownloadToken({
        assetId,
        userId: testUser._id.toString(),
        expiresInSeconds: 300,
      });

      const decoded = verifySignedDownloadToken(token);
      assert.equal(decoded.assetId, assetId);
      assert.equal(decoded.userId, testUser._id.toString());
      assert.ok(decoded.expiresAt > Math.floor(Date.now() / 1000));
    });

    it('rejects tampered download tokens with invalid signature', () => {
      const token = generateSignedDownloadToken({
        assetId,
        userId: testUser._id.toString(),
        expiresInSeconds: 300,
      });

      const parts = token.split('.');
      const tampered = `${parts[0]}.forged-signature-abc`;

      assert.throws(
        () => verifySignedDownloadToken(tampered),
        /Invalid download token signature/
      );
    });

    it('rejects expired download tokens', () => {
      // Token expired 10 seconds ago
      const token = generateSignedDownloadToken({
        assetId,
        userId: testUser._id.toString(),
        expiresInSeconds: -10,
      });

      assert.throws(
        () => verifySignedDownloadToken(token),
        /Download token has expired/
      );
    });
  });

  describe('4. Unified Asset Domain Model Persistence', () => {
    let savedAsset;

    it('persists unified Asset document with representations and metadata', async () => {
      const content = Buffer.from('Audio memo test voice recording content', 'utf8');
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      const storageResult = await writeBuffer({
        userId: testUser._id.toString(),
        originalName: 'voice-memo.wav',
        buffer: content,
        mimeType: 'audio/wav',
      });
      createdStorageKeys.push(storageResult.storageKey);

      savedAsset = await Asset.create({
        owner: testUser._id,
        originalName: storageResult.originalName,
        sanitizedName: storageResult.sanitizedName,
        mimeType: storageResult.mimeType,
        sizeBytes: storageResult.sizeBytes,
        sha256,
        storageProvider: 'local_disk',
        storageKey: storageResult.storageKey,
        storagePath: storageResult.storagePath,
        category: storageResult.category,
        purpose: 'chat_voice_input',
        representations: {
          transcript: {
            text: 'This is the transcribed audio recording memo text.',
            language: 'en',
            durationSeconds: 4.5,
            sttEngine: 'addis_ai',
            status: 'completed',
          },
          metadata: {
            sampleRate: 16000,
            channels: 1,
          },
        },
      });

      assert.ok(savedAsset._id);
      assert.equal(savedAsset.category, 'audio');
      assert.equal(savedAsset.representations.transcript.text, 'This is the transcribed audio recording memo text.');
      assert.equal(savedAsset.representations.metadata.sampleRate, 16000);
    });

    it('preserves backwards-compatibility with legacy Audio model virtual accessors', async () => {
      // Retrieve via Audio model bridge
      const audioDoc = await Audio.findById(savedAsset._id);
      assert.ok(audioDoc);
      assert.equal(audioDoc.user.toString(), testUser._id.toString());
      assert.equal(audioDoc.transcription, 'This is the transcribed audio recording memo text.');
      assert.equal(audioDoc.duration, 4.5);
      assert.equal(audioDoc.sttEngine, 'addis_ai');
      assert.equal(audioDoc.fileName, savedAsset.sanitizedName);
      assert.equal(audioDoc.size, savedAsset.sizeBytes);
    });

    it('generates signed download token directly from asset instance', () => {
      const token = savedAsset.generateDownloadToken(600);
      const verified = verifySignedDownloadToken(token);
      assert.equal(verified.assetId, savedAsset._id.toString());
      assert.equal(verified.userId, testUser._id.toString());
    });

    it('enforces assertUserOwnership returning 404 for foreign or unauthorized access (NFR-SEC-004)', () => {
      // Owner accessing asset succeeds
      const owned = assertUserOwnership(savedAsset, testUser._id, 'owner');
      assert.equal(owned._id.toString(), savedAsset._id.toString());

      // Foreign user attempting access throws 404
      assert.throws(
        () => assertUserOwnership(savedAsset, foreignUser._id, 'owner'),
        (err) => err instanceof NotFoundError && err.statusCode === 404,
        'Must throw 404 for foreign user access'
      );
    });

    it('soft deletes asset cleanly', async () => {
      await savedAsset.softDelete();
      const reloaded = await Asset.findById(savedAsset._id);
      assert.equal(reloaded.isDeleted, true);
      assert.equal(reloaded.status, 'deleted');
      assert.ok(reloaded.deletedAt);
    });
  });
});
