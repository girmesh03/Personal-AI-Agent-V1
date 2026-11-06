/**
 * @file tests/api/asset-provenance.test.js
 * @description API integration & unit tests for Asset Representation and Provenance Models (Phase 3 - Task 3.4).
 * Tests AssetRepresentation persistence, provenance tracking (pipeline, engine, sourceChecksum, durations),
 * multi-representation derivation, user isolation (NFR-SEC-004), physical binary purge with derived content
 * retention (Scenario M, FR-CORE-DOC-003), and durable citation generation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
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

describe('Asset Representation & Provenance Models (Task 3.4 - FR-CORE-DOC-003, Scenario M)', () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  const testSuffix = Date.now();

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
        email: `prov.user.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'ProvenanceOwner',
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    userA = dataA.data.user;

    const loginA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `prov.user.a.${testSuffix}@example.com`,
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
        email: `prov.user.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Bob',
        lastName: 'ProvenanceViewer',
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    userB = dataB.data.user;

    const loginB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `prov.user.b.${testSuffix}@example.com`,
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

  describe('1. AssetRepresentation Persistence Model & Provenance Integrity', () => {
    it('creates and upserts AssetRepresentation computing sha256 checksum and recording provenance', async () => {
      const mockAssetId = '507f1f77bcf86cd799439011';
      const sampleText = 'Quarterly Strategy Report for Operon Enterprise AI deployment.';
      const sampleChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      const rep = await AssetRepresentation.upsertRepresentation({
        owner: userA._id,
        sourceAssetId: mockAssetId,
        representationType: 'extracted_text',
        content: sampleText,
        mimeType: 'text/plain',
        provenance: {
          pipeline: 'documentParser',
          engine: 'pdf-parse',
          engineVersion: '1.1.1',
          sourceChecksum: sampleChecksum,
          durationMs: 42,
          isTruncated: false,
          pageRange: { startPage: 1, endPage: 5, totalPages: 5 },
          metadata: { wordCount: 8, charCount: sampleText.length },
        },
      });

      assert.ok(rep._id);
      assert.equal(rep.representationType, 'extracted_text');
      assert.equal(rep.content, sampleText);
      assert.ok(rep.checksum);
      assert.equal(rep.checksum.length, 64);
      assert.equal(rep.provenance.engine, 'pdf-parse');
      assert.equal(rep.provenance.sourceChecksum, sampleChecksum);
      assert.equal(rep.provenance.pageRange.totalPages, 5);
      assert.equal(rep.sizeBytes, Buffer.byteLength(sampleText, 'utf8'));

      // Clean up mock record
      await AssetRepresentation.findByIdAndDelete(rep._id);
    });

    it('requires complete provenance fields and fails validation if sourceChecksum or pipeline is missing', async () => {
      const invalidRep = new AssetRepresentation({
        owner: userA._id,
        sourceAssetId: '507f1f77bcf86cd799439011',
        representationType: 'extracted_text',
        content: 'Content without provenance',
        provenance: {
          // missing pipeline and sourceChecksum
          engine: 'test-engine',
        },
      });

      await assert.rejects(
        async () => {
          await invalidRep.save();
        },
        (err) => {
          assert.ok(err.name === 'ValidationError');
          return true;
        }
      );
    });
  });

  describe('2. End-to-End Extraction & Multi-Representation Derivation', () => {
    let createdAssetId;

    it('uploads a document, extracts text, and verifies multiple representations are persisted', async () => {
      // 1. Upload markdown document
      const markdownContent = `# Operon Personal AI Agent\n\n## Architecture Overview\nOperon implements a provider-neutral LangChain/LangGraph architecture.\n\n### Key Pillars\n1. Autonomous Task Execution\n2. Private Durable Storage\n3. Grounded Multi-Turn Context`;
      const boundary = '----OperonTestBoundary' + testSuffix;
      const bodyBuffer = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="operon-arch.md"\r\nContent-Type: text/markdown\r\n\r\n`),
        Buffer.from(markdownContent, 'utf8'),
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
      createdAssetId = uploadData.data.asset.id;
      assert.ok(createdAssetId);

      // 2. Trigger text extraction
      const extractRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(extractRes.status, 200);

      // 3. Fetch all representations via GET /api/v1/assets/:id/representations
      const repRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(repRes.status, 200);
      const repData = await repRes.json();
      assert.ok(Array.isArray(repData.data.representations));
      assert.ok(repData.data.representations.length >= 2); // extracted_text and text_preview

      const extractedTextRep = repData.data.representations.find((r) => r.representationType === 'extracted_text');
      assert.ok(extractedTextRep);
      assert.ok(extractedTextRep.content.includes('Operon implements a provider-neutral'));
      assert.equal(extractedTextRep.provenance.pipeline, 'documentParser');
      assert.equal(extractedTextRep.provenance.engine, 'plain-text');
      assert.equal(extractedTextRep.provenance.sourceChecksum, uploadData.data.asset.sha256);
      assert.ok(extractedTextRep.provenance.metadata.charCount > 50);

      // 4. Fetch specific representation via GET /api/v1/assets/:id/representations/extracted_text
      const singleRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations/extracted_text`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(singleRes.status, 200);
      const singleData = await singleRes.json();
      assert.equal(singleData.data.representation.representationType, 'extracted_text');
      assert.ok(singleData.data.representation.content.includes('Architecture Overview'));

      // 5. Nonexistent representation type returns 404
      const missingRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations/nonexistent_type`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(missingRes.status, 404);
    });

    it('enforces strict user isolation: User B cannot access User A representations (NFR-SEC-004)', async () => {
      // User B attempts to access User A's representations
      const repResB = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(repResB.status, 404);

      // User B attempts to fetch single representation
      const singleResB = await fetch(
        `${baseUrl}/api/v1/assets/${createdAssetId}/representations/extracted_text`,
        {
          headers: { Authorization: `Bearer ${tokenB}` },
        }
      );
      assert.equal(singleResB.status, 404);

      // User B attempts to purge User A's binary
      const purgeResB = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/purge-binary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(purgeResB.status, 404);

      // User B attempts to create citation on User A's asset
      const citationResB = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/citations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snippet: 'Attempted foreign citation' }),
      });
      assert.equal(citationResB.status, 404);
    });

    it('Scenario M: purges physical binary while retaining Asset document and derived representations', async () => {
      // 1. Verify physical binary file exists on disk
      const assetDoc = await Asset.findById(createdAssetId);
      assert.ok(assetDoc);
      const safeDiskPath = storageService.resolveSafeStoragePath(assetDoc.storageKey);
      assert.ok(fs.existsSync(safeDiskPath));
      assert.equal(assetDoc.hasBinaryPurged, false);

      // 2. Call POST /api/v1/assets/:id/purge-binary
      const purgeRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/purge-binary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(purgeRes.status, 200);
      const purgeData = await purgeRes.json();
      assert.equal(purgeData.data.asset.hasBinaryPurged, true);
      assert.ok(purgeData.data.asset.binaryPurgedAt);

      // 3. Verify physical file is gone from disk
      assert.equal(fs.existsSync(safeDiskPath), false);

      // 4. Verify derived representations and text are completely retained for conversation context
      const repRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(repRes.status, 200);
      const repData = await repRes.json();
      assert.ok(repData.data.representations.length > 0);
      const textRep = repData.data.representations.find((r) => r.representationType === 'extracted_text');
      assert.ok(textRep);
      assert.equal(textRep.isBinaryPurged, true);
      assert.ok(textRep.content.includes('Operon implements a provider-neutral'));

      // 5. Verify Asset document still retains extracted text on representations
      const updatedAsset = await Asset.findById(createdAssetId);
      assert.equal(updatedAsset.hasBinaryPurged, true);
      assert.ok(updatedAsset.representations.extractedText.includes('Operon implements a provider-neutral'));
    });

    it('generates immutable citations with cryptographic integrity binding to source checksum', async () => {
      // 1. Generate citation via POST /api/v1/assets/:id/citations
      const citationRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/citations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          representationType: 'extracted_text',
          location: { page: 1, lineStart: 1, lineEnd: 10 },
          snippet: 'Operon implements a provider-neutral LangChain/LangGraph architecture.',
        }),
      });

      assert.equal(citationRes.status, 201);
      const citationData = await citationRes.json();
      const citation = citationData.data.citation;

      assert.ok(citation.citationId);
      assert.equal(citation.assetId, createdAssetId);
      assert.equal(citation.sourceName, 'operon-arch.md');
      assert.equal(citation.location.page, 1);
      assert.ok(citation.snippet.includes('Operon implements a provider-neutral'));
      assert.equal(citation.representationType, 'extracted_text');

      // 2. Verify citation integrity
      const assetDoc = await Asset.findById(createdAssetId);
      assert.equal(verifyCitationIntegrity(citation, assetDoc), true);

      // 3. Tampered checksum fails verification
      const tamperedCitation = { ...citation, sourceChecksum: '0000000000000000000000000000000000000000000000000000000000000000' };
      assert.equal(verifyCitationIntegrity(tamperedCitation, assetDoc), false);

      // 4. Formats human-readable citation label
      const label = formatCitationLabel(citation);
      assert.ok(label.includes('operon-arch.md (p. 1)'));
    });

    it('cascading soft-delete marks Asset and all associated AssetRepresentation documents as deleted', async () => {
      // Soft-delete asset
      const delRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(delRes.status, 200);

      // Asset is soft-deleted
      const asset = await Asset.findById(createdAssetId);
      assert.equal(asset.isDeleted, true);

      // Associated representations are soft-deleted
      const representations = await AssetRepresentation.find({ sourceAssetId: createdAssetId });
      assert.ok(representations.length > 0);
      for (const r of representations) {
        assert.equal(r.isDeleted, true);
        assert.ok(r.deletedAt);
      }

      // Subsequent query returns 404
      const repRes = await fetch(`${baseUrl}/api/v1/assets/${createdAssetId}/representations`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(repRes.status, 404);
    });
  });
});
