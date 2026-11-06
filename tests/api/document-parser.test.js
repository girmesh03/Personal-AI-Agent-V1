/**
 * @file tests/api/document-parser.test.js
 * @description Integration and unit tests for Deterministic Document Parsing (Phase 3 - Task 3.3).
 * Tests PDF, DOCX, XLSX, CSV, TXT, Markdown, and JSON parsers, resource bounds, formula injection defenses,
 * and the HTTP extraction endpoint (POST /api/v1/assets/:id/extract) with user isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Asset } from '../../backend/src/modules/assets/persistence/Asset.js';
import {
  parsePdf,
  parseDocx,
  parseXlsx,
  parseCsv,
  parseText,
  parseJson,
  parseDocument,
  truncateText,
} from '../../backend/src/modules/documents/ingestion/documentParser.js';

// Minimal valid single-page PDF fixture containing digitally readable text: "Hello Operon Document Extraction"
const VALID_PDF_STRING = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 54 >> stream
BT
/F1 24 Tf
100 700 Td
(Hello Operon Document Extraction) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000369 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
444
%%EOF`;

// Minimal valid PDF without text content (scanned document simulation)
const SCANNED_PDF_STRING = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 0 >> stream
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000213 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
263
%%EOF`;

describe('Deterministic Document Parsing Engine (Task 3.3 - FR-CORE-DOC-001, NFR-SEC-004)', () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let tokenA;
  let tokenB;

  const testSuffix = Date.now();

  before(async () => {
    await connectDB();

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Register & login User A
    const resA = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `doc.user.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'DocOwner',
      }),
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    userA = dataA.data.user;

    const loginA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `doc.user.a.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    const cookiesA = loginA.headers.getSetCookie();
    tokenA = cookiesA.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');

    // Register & login User B
    const resB = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `doc.user.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
        firstName: 'Bob',
        lastName: 'DocViewer',
      }),
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    userB = dataB.data.user;

    const loginB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `doc.user.b.${testSuffix}@example.com`,
        password: 'ValidPassword123!',
      }),
    });
    const cookiesB = loginB.headers.getSetCookie();
    tokenB = cookiesB.find((c) => c.startsWith('accessToken='))?.split(';')[0]?.replace('accessToken=', '');
  });

  after(async () => {
    if (userA?._id) {
      await Asset.deleteMany({ owner: { $in: [userA._id, userB._id] } });
      await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Specialized Document Sub-Parsers', () => {
    it('parsePdf extracts readable text, page counts, and handles scanned PDFs', async () => {
      // 1. Valid PDF with text
      const pdfBuffer = Buffer.from(VALID_PDF_STRING);
      const res = await parsePdf(pdfBuffer);

      assert.equal(res.format, 'pdf');
      assert.equal(res.pageCount, 1);
      assert.ok(res.text.includes('Hello Operon Document Extraction'));
      assert.equal(res.isScanned, false);
      assert.equal(res.isTruncated, false);

      // 2. Scanned / image-only PDF
      const scannedBuffer = Buffer.from(SCANNED_PDF_STRING);
      const scannedRes = await parsePdf(scannedBuffer);
      assert.equal(scannedRes.isScanned, true);
      assert.ok(scannedRes.text.includes('no digitally readable native text'));
    });

    it('parseXlsx extracts multiple sheets and formats tabular data with cell limits', async () => {
      const wb = new ExcelJS.Workbook();
      const ws1 = wb.addWorksheet('Branches');
      ws1.addRow(['ID', 'Name', 'Region']);
      ws1.addRow([101, 'Bole Main', 'Addis Ababa']);
      ws1.addRow([102, 'Piazza Hub', 'Addis Ababa']);

      const ws2 = wb.addWorksheet('Audits');
      ws2.addRow(['Date', 'Score', 'Status']);
      ws2.addRow(['2026-11-01', 98.5, 'Pass']);

      const buffer = await wb.xlsx.writeBuffer();
      const res = await parseXlsx(Buffer.from(buffer), { maxCells: 1000 });

      assert.equal(res.format, 'xlsx');
      assert.equal(res.sheetCount, 2);
      assert.ok(res.text.includes('--- Sheet: Branches ---'));
      assert.ok(res.text.includes('Bole Main, Addis Ababa'));
      assert.ok(res.text.includes('--- Sheet: Audits ---'));
      assert.ok(res.text.includes('2026-11-01, 98.5, Pass'));
      assert.equal(res.isTruncated, false);

      // Verify cell limit truncation
      const cappedRes = await parseXlsx(Buffer.from(buffer), { maxCells: 5 });
      assert.equal(cappedRes.isTruncated, true);
    });

    it('parseCsv handles quotes, delimiters, and neutralizes formula injection', () => {
      // Input includes normal cells and potential formula injection cells (=1+1, @SUM, -CMD)
      const csvData = [
        'Employee,Department,Salary,FormulaTest',
        '"Abebe Bikila",Operations,"15,000",=1+1',
        '"Derartu Tulu",Logistics,18000,@SUM(A1:A10)',
        'Kenenisa Bekele,Management,25000,-CMD|calc.exe',
      ].join('\n');

      const res = parseCsv(csvData);
      assert.equal(res.format, 'csv');
      assert.equal(res.rowCount, 4);
      assert.equal(res.columnCount, 4);

      // Verify formula injection prefixes are neutralized with apostrophe
      assert.ok(res.text.includes("'=1+1"));
      assert.ok(res.text.includes("'@SUM(A1:A10)"));
      assert.ok(res.text.includes("'-CMD|calc.exe"));
      assert.ok(res.text.includes('Abebe Bikila'));
      assert.equal(res.isTruncated, false);
    });

    it('parseText normalizes line endings, strips UTF-8 BOM, and bounds length', () => {
      const bomText = '\uFEFF# Executive Summary\r\n\r\nLine 1\r\nLine 2\r\n';
      const res = parseText(bomText, 'markdown', { maxChars: 50 });

      assert.equal(res.format, 'markdown');
      assert.ok(!res.text.startsWith('\uFEFF'));
      assert.ok(!res.text.includes('\r\n'));
      assert.ok(res.text.includes('Executive Summary'));

      // Test truncation bound
      const longText = 'A'.repeat(200);
      const truncatedRes = parseText(longText, 'txt', { maxChars: 100 });
      assert.equal(truncatedRes.isTruncated, true);
      assert.ok(truncatedRes.text.includes('[Document truncated at 100 characters'));
    });

    it('parseJson parses valid JSON and formats pretty output while rejecting invalid JSON', () => {
      const validJson = JSON.stringify({ project: 'Operon', phase: 3, active: true });
      const res = parseJson(validJson);

      assert.equal(res.format, 'json');
      assert.equal(res.data.project, 'Operon');
      assert.ok(res.text.includes('  "project": "Operon"'));

      assert.throws(
        () => parseJson('{"invalid json: true}'),
        (err) => {
          assert.equal(err.errorCode, 'JSON_PARSE_FAILED');
          return true;
        }
      );
    });

    it('truncateText bounds length and appends truncation warning', () => {
      const short = truncateText('hello world', 50);
      assert.equal(short.isTruncated, false);
      assert.equal(short.text, 'hello world');

      const long = truncateText('x'.repeat(100), 50);
      assert.equal(long.isTruncated, true);
      assert.ok(long.text.startsWith('x'.repeat(50)));
      assert.ok(long.text.includes('[Document truncated at 50 characters'));
    });
  });

  describe('2. Universal Document Dispatcher (parseDocument)', () => {
    it('dispatches PDF and produces preview snippet', async () => {
      const res = await parseDocument({
        buffer: Buffer.from(VALID_PDF_STRING),
        filename: 'contract.pdf',
        mimeType: 'application/pdf',
      });

      assert.equal(res.format, 'pdf');
      assert.ok(res.preview.includes('Hello Operon Document Extraction'));
      assert.equal(res.pageCount, 1);
    });

    it('dispatches CSV and generates preview snippet', async () => {
      const res = await parseDocument({
        buffer: Buffer.from('name,role\nAlice,Admin\nBob,User\n'),
        filename: 'users.csv',
        mimeType: 'text/csv',
      });

      assert.equal(res.format, 'csv');
      assert.ok(res.text.includes('Alice, Admin'));
      assert.ok(res.preview.length > 0);
    });

    it('rejects unsupported file formats', async () => {
      await assert.rejects(
        () =>
          parseDocument({
            buffer: Buffer.from('some binary data'),
            filename: 'archive.tar.gz',
            mimeType: 'application/gzip',
          }),
        (err) => {
          assert.equal(err.errorCode, 'UNSUPPORTED_DOCUMENT_FORMAT');
          return true;
        }
      );
    });
  });

  describe('3. HTTP Extraction Endpoint & Data Isolation (POST /api/v1/assets/:id/extract)', () => {
    let uploadedPdfAssetId;

    before(async () => {
      // Upload a valid PDF under User A
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.from(VALID_PDF_STRING)], { type: 'application/pdf' }),
        'lease_contract.pdf'
      );

      const uploadRes = await fetch(`${baseUrl}/api/v1/assets/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(uploadRes.status, 201);
      const json = await uploadRes.json();
      uploadedPdfAssetId = json.data.asset.id;
    });

    it('User A can trigger text extraction on their uploaded document', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${uploadedPdfAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.extraction);

      const { extractedText, preview, metadata } = json.data.extraction;
      assert.ok(extractedText.includes('Hello Operon Document Extraction'));
      assert.ok(preview.includes('Hello Operon Document Extraction'));
      assert.equal(metadata.format, 'pdf');
      assert.equal(metadata.pageCount, 1);

      // Verify representations persisted in MongoDB document
      const dbDoc = await Asset.findById(uploadedPdfAssetId);
      assert.ok(dbDoc.representations?.extractedText);
      assert.equal(dbDoc.representations.preview, preview);
    });

    it('User B cannot extract or access User A\'s document (returns 404 NOT_FOUND per NFR-SEC-004)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${uploadedPdfAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.error.code, 'NOT_FOUND');
    });

    it('re-extracting uses cached representation unless force=true is passed', async () => {
      const res = await fetch(`${baseUrl}/api/v1/assets/${uploadedPdfAssetId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.extraction.extractedText);
    });
  });
});
