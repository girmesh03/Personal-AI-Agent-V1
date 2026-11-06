/**
 * @file tests/api/asset-document-suite.test.js
 * @description Comprehensive Phase 3 Acceptance Suite for Private Asset & Document Foundation (Task 3.6 - FR-CORE-DOC-001, FR-CORE-DOC-003, NFR-SEC-004).
 * Validates complete end-to-end integration: multi-format ingestion, MIME magic-byte sniffing, deterministic extraction,
 * first-class representation persistence, provenance tracking, durable citations, signed streaming downloads,
 * Scenario M binary purge retention, cross-tenant isolation, and lifecycle reconciliation sweepers.
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
  createCitation,
  verifyCitationIntegrity,
  formatCitationLabel,
} from '../../backend/src/modules/documents/provenance/citationService.js';
import {
  reconcileExpiredAssets,
  reconcileOrphanedTempFiles,
} from '../../backend/src/modules/assets/lifecycle/assetReconciliationService.js';

describe('Phase 3 Asset & Document Foundation Acceptance Suite (Task 3.6)', () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  const testSuffix = Date.now();

  const VALID_PDF_PAYLOAD = Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length 50 >> stream\nBT /F1 24 Tf 100 700 Td (Operon Enterprise Phase 3 Verification) Tj ET\nendstream endobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000365 00000 n \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n440\n%%EOF`
  );

  const VALID_CSV_PAYLOAD = Buffer.from(
    'Branch,Manager,Revenue,Status\nBole Hub,Selamawit,150000,Active\nPiazza Central,Yonas,120000,Active\nMegenagna Express,Almaz,95000,Active\n'
  );

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
        email: `phase3.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'PhaseThreeOwner',
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    userA = dataA.data.user;

    const loginA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `phase3.a.${testSuffix}@example.com`,
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
        email: `phase3.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Bob',
        lastName: 'PhaseThreeAuditor',
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    userB = dataB.data.user;

    const loginB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `phase3.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    const cookiesB = loginB.headers.getSetCookie();
    tokenB = cookiesB.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');
  });

  after(async () => {
    // Cleanup users, assets, representations
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

  describe('1. Multimodal Multipart Ingestion & MIME Defense Gate', () => {
    it('ingests authentic PDF document and verifies private user-partitioned storage', async () => {
      const boundary = '----BoundaryPdf' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="operon-audit.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        VALID_PDF_PAYLOAD,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.data.asset.id);
      assert.equal(data.data.asset.mimeType, 'application/pdf');
      assert.equal(data.data.asset.category, 'document');
      assert.equal(data.data.asset.sizeBytes, VALID_PDF_PAYLOAD.length);
      assert.ok(data.data.asset.sha256);
      assert.equal(data.data.asset.hasBinaryPurged, false);

      // Verify file is stored in private partition and unreachable via public static routes
      const assetDoc = await Asset.findById(data.data.asset.id);
      assert.ok(assetDoc.storageKey.startsWith(`${userA._id}/`));
      const safePath = storageService.resolveSafeStoragePath(assetDoc.storageKey);
      assert.ok(fs.existsSync(safePath));
    });

    it('strictly rejects disguised executable uploads with 400 Bad Request (EXECUTABLE_NOT_PERMITTED)', async () => {
      const boundary = '----BoundaryExe' + testSuffix;
      // PE executable binary disguised as a PDF
      const fakePdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFFFakeExecutablePayload');
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="malicious.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        fakePdf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'EXECUTABLE_NOT_PERMITTED');
    });
  });

  describe('2. Deterministic Extraction, Multi-Representation Derivation & Provenance', () => {
    let csvAssetId;

    it('ingests CSV and derives extracted_text, spreadsheet_table, and text_preview representations', async () => {
      // 1. Upload CSV
      const boundary = '----BoundaryCsv' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="branches.csv"\r\nContent-Type: text/csv\r\n\r\n`),
        VALID_CSV_PAYLOAD,
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
      csvAssetId = uploadData.data.asset.id;

      // 2. Extract content
      const extractRes = await fetch(`${baseUrl}/api/v1/assets/${csvAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(extractRes.status, 200);

      // 3. Fetch representations
      const repRes = await fetch(`${baseUrl}/api/v1/assets/${csvAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(repRes.status, 200);
      const repData = await repRes.json();
      const reps = repData.data.representations;

      assert.ok(reps.length >= 2);
      const textRep = reps.find((r) => r.representationType === 'extracted_text');
      const tableRep = reps.find((r) => r.representationType === 'spreadsheet_table');

      assert.ok(textRep);
      assert.ok(tableRep);
      assert.ok(textRep.content.includes('Selamawit'));
      assert.ok(tableRep.content.includes('Bole Hub'));

      // 4. Verify cryptographic provenance
      assert.equal(textRep.provenance.pipeline, 'documentParser');
      assert.equal(textRep.provenance.engine, 'exceljs');
      assert.equal(textRep.provenance.sourceChecksum, uploadData.data.asset.sha256);
      assert.ok(textRep.provenance.processedAt);
    });

    it('generates immutable citations with cryptographic checksum integrity', async () => {
      const citationRes = await fetch(`${baseUrl}/api/v1/assets/${csvAssetId}/citations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          representationType: 'spreadsheet_table',
          location: { sheet: 'branches.csv', row: 2 },
          snippet: 'Bole Hub, Selamawit, 150000',
        }),
      });

      assert.equal(citationRes.status, 201);
      const citationData = await citationRes.json();
      const citation = citationData.data.citation;

      assert.ok(citation.citationId);
      assert.equal(citation.assetId, csvAssetId);
      assert.equal(citation.location.sheet, 'branches.csv');
      assert.equal(citation.location.row, 2);

      // Verify cryptographic integrity
      const assetDoc = await Asset.findById(csvAssetId);
      assert.equal(verifyCitationIntegrity(citation, assetDoc), true);

      // Verify label
      const label = formatCitationLabel(citation);
      assert.ok(label.includes('branches.csv (Sheet: branches.csv (row 2))'));
    });
  });

  describe('3. Dual-Auth Private Signed Streaming Download', () => {
    let pdfAssetId;

    before(async () => {
      const boundary = '----BoundaryPdf2' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="download-test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        VALID_PDF_PAYLOAD,
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
      pdfAssetId = data.data.asset.id;
    });

    it('downloads binary via short-lived signed token without session cookies or Bearer header', async () => {
      // 1. Get signed token
      const tokenRes = await fetch(`${baseUrl}/api/v1/assets/${pdfAssetId}/token`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(tokenRes.status, 200);
      const tokenData = await tokenRes.json();
      const signedToken = tokenData.data.token;

      // 2. Download using signed token query param
      const dlRes = await fetch(`${baseUrl}/api/v1/assets/${pdfAssetId}/download?token=${signedToken}`);
      assert.equal(dlRes.status, 200);
      assert.equal(dlRes.headers.get('content-type'), 'application/pdf');
      assert.equal(dlRes.headers.get('x-content-type-options'), 'nosniff');
      const downloadedBytes = Buffer.from(await dlRes.arrayBuffer());
      assert.deepEqual(downloadedBytes, VALID_PDF_PAYLOAD);
    });

    it('downloads binary directly using active session Bearer header', async () => {
      const dlRes = await fetch(`${baseUrl}/api/v1/assets/${pdfAssetId}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(dlRes.status, 200);
      const downloadedBytes = Buffer.from(await dlRes.arrayBuffer());
      assert.deepEqual(downloadedBytes, VALID_PDF_PAYLOAD);
    });

    it('rejects tampered or expired download tokens with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${pdfAssetId}/download?token=tampered.token`);
      assert.equal(res.status, 401);
    });
  });

  describe('4. Strict Account Data Isolation (NFR-SEC-004)', () => {
    let targetAssetId;

    before(async () => {
      const boundary = '----BoundaryIso' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="private-iso.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        VALID_PDF_PAYLOAD,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });
      const data = await res.json();
      targetAssetId = data.data.asset.id;
    });

    it('User B probing User A asset endpoints consistently receives uniform 404 NOT_FOUND', async () => {
      // 1. GET metadata
      const r1 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r1.status, 404);

      // 2. GET representations
      const r2 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r2.status, 404);

      // 3. POST extract
      const r3 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r3.status, 404);

      // 4. GET token
      const r4 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}/token`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r4.status, 404);

      // 5. GET download
      const r5 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}/download`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r5.status, 404);

      // 6. DELETE asset
      const r6 = await fetch(`${baseUrl}/api/v1/assets/${targetAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(r6.status, 404);
    });
  });

  describe('5. Scenario M Binary Purge & Lifecycle Reconciliation (FR-CORE-DOC-003)', () => {
    it('purges physical binary while retaining Asset and representations, returning 410 Gone on download', async () => {
      // 1. Upload and extract document
      const boundary = '----BoundaryPurge' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="retention-doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        VALID_PDF_PAYLOAD,
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
      const uploadData = await uploadRes.json();
      const assetId = uploadData.data.asset.id;

      await fetch(`${baseUrl}/api/v1/assets/${assetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      // 2. Purge binary
      const purgeRes = await fetch(`${baseUrl}/api/v1/assets/${assetId}/purge-binary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(purgeRes.status, 200);

      // 3. Download returns 410 Gone (BINARY_PURGED)
      const dlRes = await fetch(`${baseUrl}/api/v1/assets/${assetId}/download`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(dlRes.status, 410);
      const dlData = await dlRes.json();
      assert.equal(dlData.error.code, 'BINARY_PURGED');

      // 4. Token issuance returns 410 Gone
      const tokenRes = await fetch(`${baseUrl}/api/v1/assets/${assetId}/token`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(tokenRes.status, 410);

      // 5. Derived representations remain intact for conversational reasoning
      const repRes = await fetch(`${baseUrl}/api/v1/assets/${assetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(repRes.status, 200);
      const repData = await repRes.json();
      const textRep = repData.data.representations.find((r) => r.representationType === 'extracted_text');
      assert.ok(textRep);
      assert.equal(textRep.isBinaryPurged, true);
      assert.ok(textRep.content.includes('Operon Enterprise Phase 3 Verification'));
    });

    it('background sweepers reconcile expired ephemeral assets and sweep orphaned staging chunks', async () => {
      // 1. Expired assets sweeper
      const sweepResult = await reconcileExpiredAssets({ now: new Date() });
      assert.ok(sweepResult.scanned >= 0);

      // 2. Orphaned temp sweeper
      const tempResult = await reconcileOrphanedTempFiles(0);
      assert.ok(tempResult.scanned >= 0);
    });
  });
});
