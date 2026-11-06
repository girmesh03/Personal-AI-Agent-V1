/**
 * @file tests/api/asset-download-lifecycle.test.js
 * @description API integration & unit tests for Private Signed Download and Asset Lifecycle Reconciliation (Phase 3 - Task 3.5).
 * Tests HMAC signed download token issuance, signed & session streaming downloads, security boundaries (tampering,
 * expiration, asset ID mismatches, NFR-SEC-004 isolation), HTTP 410 Gone on purged binaries (Scenario M),
 * and background lifecycle sweepers (reconcileExpiredAssets, reconcileOrphanedTempFiles).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import { AssetRepresentation } from '../../backend/src/modules/assets/persistence/AssetRepresentation.js';
import * as storageService from '../../backend/src/modules/assets/storage/storageService.js';
import {
  reconcileExpiredAssets,
  reconcileOrphanedTempFiles,
} from '../../backend/src/modules/assets/lifecycle/assetReconciliationService.js';

describe('Private Signed Download & Asset Lifecycle Reconciliation (Task 3.5 - FR-CORE-DOC-003, Scenario M)', () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  let assetA;
  const testSuffix = Date.now();
  const samplePdfBytes = Buffer.from('%PDF-1.4\n%Operon Test Signed Download Binary File\n%%EOF');

  before(async () => {
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 1. Register & login User A
    const resA = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `download.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'Downloader',
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    userA = dataA.data.user;

    const loginA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `download.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    const cookiesA = loginA.headers.getSetCookie();
    tokenA = cookiesA.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');

    // 2. Register & login User B
    const resB = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `download.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Bob',
        lastName: 'Viewer',
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    userB = dataB.data.user;

    const loginB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `download.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    const cookiesB = loginB.headers.getSetCookie();
    tokenB = cookiesB.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');

    // 3. Upload a sample PDF for User A
    const boundary = '----UploadBoundary' + testSuffix;
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      samplePdfBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${baseUrl}/api/v1/assets/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });
    assert.equal(uploadRes.status, 201);
    const uploadData = await uploadRes.json();
    assetA = uploadData.data.asset;
  });

  after(async () => {
    // Cleanup users, assets, files
    if (userA?._id) {
      await AssetRepresentation.deleteMany({ owner: userA._id });
      const assetsA = await Asset.find({ owner: userA._id });
      for (const a of assetsA) {
        try {
          await storageService.deleteFile(a.storageKey);
        } catch (_e) {}
      }
      await Asset.deleteMany({ owner: userA._id });
      await User.findByIdAndDelete(userA._id);
    }

    if (userB?._id) {
      await AssetRepresentation.deleteMany({ owner: userB._id });
      const assetsB = await Asset.find({ owner: userB._id });
      for (const b of assetsB) {
        try {
          await storageService.deleteFile(b.storageKey);
        } catch (_e) {}
      }
      await Asset.deleteMany({ owner: userB._id });
      await User.findByIdAndDelete(userB._id);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Signed Download Token Issuance (GET /api/v1/assets/:id/token)', () => {
    it('issues an HMAC-signed short-lived token and download URL for User A asset', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/token?expiresIn=600`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.token);
      assert.ok(data.data.downloadUrl.includes(`/api/v1/assets/${assetA.id}/download?token=`));
      assert.equal(data.data.expiresInSeconds, 600);
      assert.ok(data.data.expiresAt);
    });

    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/token`);
      assert.equal(res.status, 401);
    });

    it('rejects foreign user attempt with 404 NOT_FOUND (NFR-SEC-004)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/token`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);
    });
  });

  describe('2. Binary Streaming Download (GET /api/v1/assets/:id/download)', () => {
    let signedToken;

    before(async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/token`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      signedToken = data.data.token;
    });

    it('downloads binary via signed token without session cookies or Authorization header', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download?token=${signedToken}`);
      assert.equal(res.status, 200);

      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.equal(res.headers.get('content-length'), String(samplePdfBytes.length));
      assert.ok(res.headers.get('content-disposition').includes('inline'));
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

      const arrayBuffer = await res.arrayBuffer();
      const downloadedBuffer = Buffer.from(arrayBuffer);
      assert.deepEqual(downloadedBuffer, samplePdfBytes);
    });

    it('downloads binary as attachment when download=true is passed', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download?token=${signedToken}&download=true`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-disposition').includes('attachment'));
    });

    it('downloads binary via active session Bearer header without token', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const downloadedBuffer = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(downloadedBuffer, samplePdfBytes);
    });

    it('rejects download when neither token nor session is provided with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download`);
      assert.equal(res.status, 401);
    });

    it('rejects tampered token signature with 401 UNAUTHENTICATED', async () => {
      const parts = signedToken.split('.');
      const tampered = `${parts[0]}.invalidSignature123`;
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download?token=${tampered}`);
      assert.equal(res.status, 401);
    });

    it('rejects token asset mismatch with 401 UNAUTHENTICATED', async () => {
      const otherAssetId = '507f1f77bcf86cd799439011';
      const res = await fetch(`${baseUrl}/api/v1/assets/${otherAssetId}/download?token=${signedToken}`);
      assert.equal(res.status, 401);
    });

    it('rejects expired token with 401 UNAUTHENTICATED', async () => {
      // Issue token with -10 second expiry
      const expiredToken = storageService.generateSignedDownloadToken({
        assetId: assetA.id,
        userId: userA._id.toString(),
        expiresInSeconds: -10,
      });

      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download?token=${expiredToken}`);
      assert.equal(res.status, 401);
    });

    it('rejects User B trying to download User A asset using User B session with 404 NOT_FOUND', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${assetA.id}/download`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);
    });
  });

  describe('3. Binary Purge (Scenario M) & Soft-Delete Download Defenses', () => {
    let purgeableAsset;

    before(async () => {
      // Create a dedicated asset to test purge
      const boundary = '----UploadPurge' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="purge-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        samplePdfBytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });
      const data = await uploadRes.json();
      purgeableAsset = data.data.asset;
    });

    it('returns 410 Gone (BINARY_PURGED) when downloading an asset whose binary has been purged', async () => {
      // 1. Purge binary
      const purgeRes = await fetch(`${baseUrl}/api/v1/assets/${purgeableAsset.id}/purge-binary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(purgeRes.status, 200);

      // 2. Token request returns 410
      const tokenRes = await fetch(`${baseUrl}/api/v1/assets/${purgeableAsset.id}/token`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(tokenRes.status, 410);

      // 3. Direct download returns 410 Gone
      const dlRes = await fetch(`${baseUrl}/api/v1/assets/${purgeableAsset.id}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(dlRes.status, 410);
      const dlData = await dlRes.json();
      assert.equal(dlData.error.code, 'BINARY_PURGED');
    });

    it('returns 404 NOT_FOUND when downloading a soft-deleted asset', async () => {
      // Create another asset and soft delete it
      const boundary = '----UploadDel' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="del-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        samplePdfBytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });
      const data = await uploadRes.json();
      const delAssetId = data.data.asset.id;

      // Soft delete
      await fetch(`${baseUrl}/api/v1/assets/${delAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      // Attempt download
      const dlRes = await fetch(`${baseUrl}/api/v1/assets/${delAssetId}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(dlRes.status, 404);
    });
  });

  describe('4. Lifecycle Sweeper & Reconciliation Engine (reconcileExpiredAssets, reconcileOrphanedTempFiles)', () => {
    it('reconcileExpiredAssets purges physical binary of expired ephemeral assets while preserving metadata', async () => {
      // 1. Create an ephemeral asset with expiresAt in the past
      const boundary = '----UploadEphemeral' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ephemeral-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        samplePdfBytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });
      const data = await uploadRes.json();
      const ephAssetId = data.data.asset.id;

      // Backdate expiresAt to past and set retentionPolicy: 'ephemeral'
      await Asset.findByIdAndUpdate(ephAssetId, {
        retentionPolicy: 'ephemeral',
        expiresAt: new Date(Date.now() - 60000), // 1 min ago
      });

      const ephDoc = await Asset.findById(ephAssetId);
      const safeDiskPath = storageService.resolveSafeStoragePath(ephDoc.storageKey);
      assert.ok(fs.existsSync(safeDiskPath));

      // 2. Run reconciliation sweep
      const sweepResult = await reconcileExpiredAssets({ now: new Date() });
      assert.ok(sweepResult.scanned >= 1);
      assert.ok(sweepResult.purged >= 1);

      // 3. Verify physical file is purged from disk
      assert.equal(fs.existsSync(safeDiskPath), false);

      // 4. Verify Asset document still exists and has hasBinaryPurged: true
      const updatedEph = await Asset.findById(ephAssetId);
      assert.ok(updatedEph);
      assert.equal(updatedEph.hasBinaryPurged, true);
      assert.ok(updatedEph.binaryPurgedAt);
    });

    it('reconcileOrphanedTempFiles sweeps abandoned files older than threshold from temp storage', async () => {
      const tempDir = storageService.getTempStorageRoot();
      const orphanFile = path.join(tempDir, `orphan-test-${Date.now()}.tmp`);

      // Write test orphan file
      fs.writeFileSync(orphanFile, Buffer.from('Orphaned upload payload chunk'));
      assert.ok(fs.existsSync(orphanFile));

      // Backdate mtime to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 7200000);
      fs.utimesSync(orphanFile, twoHoursAgo, twoHoursAgo);

      // Run temp sweeper with 1 hour max age
      const result = await reconcileOrphanedTempFiles(3600000);
      assert.ok(result.scanned >= 1);
      assert.ok(result.unlinked >= 1);
      assert.ok(result.reclaimedBytes > 0);

      // Verify file is gone
      assert.equal(fs.existsSync(orphanFile), false);
    });
  });
});
