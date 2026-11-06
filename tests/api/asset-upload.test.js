/**
 * @file tests/api/asset-upload.test.js
 * @description Integration and unit tests for Secure Streaming Multipart Upload Pipeline (Phase 3 - Task 3.2).
 * Verifies MIME magic-byte sniffing, executable rejection, size boundaries, private storage, and user isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import {
  isExecutable,
  detectMimeFromBytes,
  sniffMimeType,
} from '../../backend/src/modules/assets/validation/mimeSniffer.js';
import {
  getPrivateStorageRoot,
  getPrivateTempRoot,
  resolveSafeStoragePath,
} from '../../backend/src/modules/assets/storage/storageService.js';
import {
  uploadSingleAudioMiddleware,
  uploadReportAudiosMiddleware,
} from '../../backend/src/middleware/uploadMiddleware.js';

describe('Secure Streaming Multipart Upload Pipeline (Task 3.2 - FR-CORE-DOC-003, NFR-SEC-004)', () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let tokenA;
  let tokenB;

  const testSuffix = Date.now();

  before(async () => {
    await connectDB();

    // Start ephemeral server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Register User A
    const resA = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `uploader.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'Uploader',
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    userA = dataA.data.user;

    // Login User A with JSON response requested
    const loginA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `uploader.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(loginA.status, 200);
    const cookiesA = loginA.headers.getSetCookie();
    tokenA = cookiesA.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');

    // Register User B
    const resB = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `uploader.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Bob',
        lastName: 'Viewer',
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    userB = dataB.data.user;

    // Login User B
    const loginB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `uploader.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(loginB.status, 200);
    const cookiesB = loginB.headers.getSetCookie();
    tokenB = cookiesB.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');
  });

  after(async () => {
    // Clean up created DB assets and users
    if (userA?._id) {
      await Asset.deleteMany({ owner: { $in: [userA._id, userB._id] } });
      await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. MIME Magic-Byte Sniffing & Executable Rejection', () => {
    it('detects executable binary formats and shell scripts', () => {
      // Windows PE (MZ)
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      assert.equal(isExecutable(peBuffer), true);

      // Linux ELF
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
      assert.equal(isExecutable(elfBuffer), true);

      // Java Bytecode
      const javaBuffer = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00]);
      assert.equal(isExecutable(javaBuffer), true);

      // Shell script shebang
      const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /\n');
      assert.equal(isExecutable(scriptBuffer), true);

      // Normal PDF
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
      assert.equal(isExecutable(pdfBuffer), false);
    });

    it('rejects executable content in sniffMimeType with EXECUTABLE_NOT_PERMITTED', () => {
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      assert.throws(
        () => sniffMimeType(peBuffer, 'invoice.pdf', 'application/pdf'),
        (err) => {
          assert.equal(err.name, 'BadRequestError');
          assert.equal(err.errorCode, 'EXECUTABLE_NOT_PERMITTED');
          return true;
        }
      );
    });

    it('correctly identifies distinct media formats from magic bytes', () => {
      // PDF
      const pdf = Buffer.from('%PDF-1.7\nsome data');
      assert.equal(detectMimeFromBytes(pdf, 'doc.pdf'), 'application/pdf');

      // PNG
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      assert.equal(detectMimeFromBytes(png, 'pic.png'), 'image/png');

      // JPEG
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      assert.equal(detectMimeFromBytes(jpeg, 'photo.jpg'), 'image/jpeg');

      // WAV
      const wav = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVE'),
        Buffer.from('fmt '),
      ]);
      assert.equal(detectMimeFromBytes(wav, 'audio.wav'), 'audio/wav');

      // MP3
      const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
      assert.equal(detectMimeFromBytes(mp3, 'song.mp3'), 'audio/mpeg');

      // WebM
      const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]);
      assert.equal(detectMimeFromBytes(webm, 'voice.webm'), 'audio/webm');

      // DOCX
      const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      assert.equal(
        detectMimeFromBytes(docx, 'contract.docx'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      // Plain text CSV
      const csv = Buffer.from('id,name,role\n1,Alice,Admin\n2,Bob,User\n');
      assert.equal(detectMimeFromBytes(csv, 'report.csv'), 'text/csv');
    });

    it('rejects declared MIME type contradictions in sniffMimeType', () => {
      // Content is PDF, but declared as image/png
      const pdf = Buffer.from('%PDF-1.4\n...');
      assert.throws(
        () => sniffMimeType(pdf, 'file.png', 'image/png'),
        (err) => {
          assert.equal(err.errorCode, 'INVALID_FILE_TYPE');
          return true;
        }
      );
    });
  });

  describe('2. HTTP Multipart Ingestion Pipeline (POST /api/v1/assets/upload)', () => {
    it('rejects unauthenticated upload request with 401 UNAUTHENTICATED', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.from('%PDF-1.4\nContent')], { type: 'application/pdf' }),
        'unauth.pdf'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error.code, 'UNAUTHENTICATED');
    });

    it('successfully uploads and stores a valid PDF document', async () => {
      const pdfContent = Buffer.from('%PDF-1.4\n%Deterministic test PDF content for Operon Phase 3\n');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([pdfContent], { type: 'application/pdf' }),
        'lease_agreement.pdf'
      );
      formData.append('purpose', 'attachment');

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.asset);

      const asset = json.data.asset;
      assert.ok(asset.id);
      assert.equal(asset.originalName, 'lease_agreement.pdf');
      assert.equal(asset.mimeType, 'application/pdf');
      assert.equal(asset.category, 'document');
      assert.equal(asset.status, 'ready');
      assert.equal(asset.sizeBytes, pdfContent.length);

      // Verify internal paths are NOT exposed to client
      assert.equal(asset.storageKey, undefined);
      assert.equal(asset.storagePath, undefined);

      // Verify database record
      const dbDoc = await Asset.findById(asset.id);
      assert.ok(dbDoc);
      assert.equal(String(dbDoc.owner), String(userA._id));
      assert.equal(dbDoc.sha256, crypto.createHash('sha256').update(pdfContent).digest('hex'));

      // Verify file exists in private storage root
      const fullPath = resolveSafeStoragePath(dbDoc.storageKey);
      assert.equal(fs.existsSync(fullPath), true);
      assert.equal(fs.readFileSync(fullPath).toString('utf8'), pdfContent.toString('utf8'));
    });

    it('successfully uploads a valid PNG image and infers "image" category', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([pngHeader], { type: 'image/png' }),
        'screenshot.png'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.asset.category, 'image');
      assert.equal(json.data.asset.mimeType, 'image/png');
    });

    it('successfully uploads a valid WAV audio file and infers "audio" category', async () => {
      const wavHeader = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVE'),
        Buffer.from('fmt '),
        Buffer.alloc(16),
      ]);
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([wavHeader], { type: 'audio/wav' }),
        'recording.wav'
      );
      formData.append('retentionPolicy', 'temporary');

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.asset.category, 'audio');
      assert.equal(json.data.asset.retentionPolicy, 'temporary');
      assert.ok(json.data.asset.expiresAt);
    });

    it('rejects disguised executable uploaded as a PDF with 400 Bad Request', async () => {
      // Disguised Windows PE file named .pdf
      const fakePdf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([fakePdf], { type: 'application/pdf' }),
        'exploit.pdf'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'EXECUTABLE_NOT_PERMITTED');

      // Verify no asset was created in database
      const count = await Asset.countDocuments({ originalName: 'exploit.pdf' });
      assert.equal(count, 0);
    });

    it('rejects file when declared extension contradicts detected magic bytes', async () => {
      // JPEG payload declared as .pdf
      const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([jpegBytes], { type: 'application/pdf' }),
        'corrupted.pdf'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'INVALID_FILE_TYPE');
    });

    it('rejects empty file (0 bytes) with 400 Bad Request', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([], { type: 'application/pdf' }),
        'empty.pdf'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'EMPTY_FILE');
    });

    it('rejects unsupported file extensions with 400 Bad Request', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.from('Hello world')], { type: 'application/x-sh' }),
        'script.sh'
      );

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'UNSUPPORTED_FILE_TYPE');
    });

    it('successfully uploads multiple files in a single batch', async () => {
      const pdfBytes = Buffer.from('%PDF-1.4\nDoc 1');
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const csvBytes = Buffer.from('col1,col2\nval1,val2\n');

      const formData = new FormData();
      formData.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), 'batch1.pdf');
      formData.append('files', new Blob([pngBytes], { type: 'image/png' }), 'batch2.png');
      formData.append('files', new Blob([csvBytes], { type: 'text/csv' }), 'batch3.csv');

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.assets.length, 3);
      assert.equal(json.data.assets[0].category, 'document');
      assert.equal(json.data.assets[1].category, 'image');
      assert.equal(json.data.assets[2].category, 'document');
    });

    it('rejects batch exceeding file count limit (> 5 files)', async () => {
      const pdfBytes = Buffer.from('%PDF-1.4\nDoc');
      const formData = new FormData();
      for (let i = 0; i < 6; i++) {
        formData.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), `doc_${i}.pdf`);
      }

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error.code, 'LIMIT_FILE_COUNT');
    });
  });

  describe('3. Asset Retrieval & User Data Isolation (NFR-SEC-004)', () => {
    let testAssetId;

    before(async () => {
      // Upload an asset owned by User A
      const pdf = Buffer.from('%PDF-1.4\nAlice Private Confidential Document');
      const formData = new FormData();
      formData.append('file', new Blob([pdf], { type: 'application/pdf' }), 'alice_private.pdf');

      const res = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });
      const data = await res.json();
      testAssetId = data.data.asset.id;
    });

    it('User A can fetch their own asset by ID', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${testAssetId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.asset.id, testAssetId);
      assert.equal(data.data.asset.originalName, 'alice_private.pdf');
    });

    it('User B cannot view or discover User A\'s asset (returns 404 NOT_FOUND)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${testAssetId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error.code, 'NOT_FOUND');
    });

    it('User A can list their assets with pagination', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.data.assets));
      assert.ok(data.data.assets.length > 0);
      assert.ok(data.data.pagination);
      assert.equal(data.data.pagination.page, 1);
    });

    it('User A can filter assets by category', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets?category=image`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      for (const asset of data.data.assets) {
        assert.equal(asset.category, 'image');
      }
    });

    it('User A can soft delete their asset', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${testAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);

      // Verify that after deletion, asset is no longer returned in list
      const listRes = await fetch(`${baseUrl}/api/v1/assets`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const listData = await listRes.json();
      assert.equal(listData.data.assets.some((a) => a.id === testAssetId), false);
    });
  });

  describe('4. Legacy Compatibility Bridges', () => {
    it('verifies uploadMiddleware exports legacy helper functions', () => {
      assert.equal(typeof uploadSingleAudioMiddleware, 'function');
      assert.equal(typeof uploadReportAudiosMiddleware, 'function');
    });
  });
});
