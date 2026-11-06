/**
 * @module modules/documents/ingestion/documentParser
 * @description Deterministic multi-format document parser and text extraction engine (Phase 3 - Task 3.3).
 * Supports PDF, DOCX, XLSX, CSV, TXT, Markdown, and JSON with hard resource caps defending against
 * zip bombs, memory exhaustion, and unbounded context window inflation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { DOCUMENT_PARSING_LIMITS } from '../../../utils/constants.js';
import { BadRequestError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../config/logger.js';

/**
 * Truncates text if it exceeds maximum character limit and appends a truncation notice.
 *
 * @param {string} text
 * @param {number} [maxChars=DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS]
 * @returns {{ text: string, isTruncated: boolean }}
 */
export const truncateText = (text, maxChars = DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS) => {
  if (!text || text.length <= maxChars) {
    return { text: text || '', isTruncated: false };
  }

  const truncated = text.slice(0, maxChars);
  const notice = `\n\n[Document truncated at ${maxChars} characters for context safety]`;
  return { text: truncated + notice, isTruncated: true };
};

/**
 * Parses native readable text and page structure from a PDF buffer or file.
 *
 * @param {Buffer | string} input - PDF Buffer or absolute file path
 * @param {object} [options={}]
 * @param {number} [options.maxPages=DOCUMENT_PARSING_LIMITS.MAX_PAGES]
 * @param {number} [options.maxChars=DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS]
 * @returns {Promise<{
 *   text: string,
 *   pageCount: number,
 *   charCount: number,
 *   isTruncated: boolean,
 *   isScanned: boolean,
 *   format: 'pdf',
 * }>}
 */
export const parsePdf = async (input, options = {}) => {
  const maxPages = options.maxPages || DOCUMENT_PARSING_LIMITS.MAX_PAGES;
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;

  let buffer;
  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (typeof input === 'string') {
    buffer = fs.readFileSync(input);
  } else {
    throw new BadRequestError('Invalid input provided to PDF parser.', 'INVALID_PARSER_INPUT');
  }

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const totalPages = result.total || (result.pages ? result.pages.length : 1);

    // Extract pages up to maxPages cap
    const pagesToInclude = (result.pages || []).slice(0, maxPages);
    const rawText = pagesToInclude
      .map((p) => (p.text || '').trim())
      .filter(Boolean)
      .join('\n\n');

    const cleanText = rawText.replace(/-- \d+ of \d+ --/g, '').trim();
    const isScanned = cleanText.length === 0;

    let finalResult = cleanText;
    let truncated = totalPages > maxPages;

    if (isScanned) {
      finalResult = '[Notice: This PDF contains no digitally readable native text. It may be a scanned document or image-only PDF.]';
    } else {
      const boundCheck = truncateText(finalResult, maxChars);
      finalResult = boundCheck.text;
      if (boundCheck.isTruncated) truncated = true;
    }

    return {
      text: finalResult,
      pageCount: totalPages,
      charCount: finalResult.length,
      isTruncated: truncated,
      isScanned,
      format: 'pdf',
    };
  } catch (err) {
    logger.error('[documentParser] PDF parsing failed:', { error: err.message });
    throw new BadRequestError(`Failed to parse PDF document: ${err.message}`, 'PDF_PARSE_FAILED');
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch (_) {}
    }
  }
};

/**
 * Parses raw text, headings, and tables from a Microsoft Word (.docx) document.
 *
 * @param {Buffer | string} input
 * @param {object} [options={}]
 * @returns {Promise<{
 *   text: string,
 *   charCount: number,
 *   isTruncated: boolean,
 *   format: 'docx',
 *   warnings: string[],
 * }>}
 */
export const parseDocx = async (input, options = {}) => {
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;

  try {
    const mammothParam = Buffer.isBuffer(input)
      ? { buffer: input }
      : { path: input };

    const result = await mammoth.extractRawText(mammothParam);
    const rawText = (result.value || '').trim();

    const { text, isTruncated } = truncateText(rawText, maxChars);

    return {
      text,
      charCount: text.length,
      isTruncated,
      format: 'docx',
      warnings: (result.messages || []).map((m) => m.message),
    };
  } catch (err) {
    logger.error('[documentParser] DOCX parsing failed:', { error: err.message });
    throw new BadRequestError(`Failed to parse DOCX document: ${err.message}`, 'DOCX_PARSE_FAILED');
  }
};

/**
 * Parses sheets, rows, and cells from a Microsoft Excel (.xlsx) spreadsheet into clean tabular text.
 *
 * @param {Buffer | string} input
 * @param {object} [options={}]
 * @param {number} [options.maxSheets=DOCUMENT_PARSING_LIMITS.MAX_SHEETS]
 * @param {number} [options.maxCells=DOCUMENT_PARSING_LIMITS.MAX_CELLS]
 * @returns {Promise<{
 *   text: string,
 *   sheetCount: number,
 *   sheets: Array<{ name: string, rowCount: number, columnCount: number }>,
 *   charCount: number,
 *   isTruncated: boolean,
 *   format: 'xlsx',
 * }>}
 */
export const parseXlsx = async (input, options = {}) => {
  const maxSheets = options.maxSheets || DOCUMENT_PARSING_LIMITS.MAX_SHEETS;
  const maxCells = options.maxCells || DOCUMENT_PARSING_LIMITS.MAX_CELLS;
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;

  try {
    const workbook = new ExcelJS.Workbook();
    if (Buffer.isBuffer(input)) {
      await workbook.xlsx.load(input);
    } else if (typeof input === 'string') {
      await workbook.xlsx.readFile(input);
    } else {
      throw new BadRequestError('Invalid input provided to XLSX parser.', 'INVALID_PARSER_INPUT');
    }

    const sheetsSummary = [];
    const sheetTexts = [];
    let totalCells = 0;
    let isTruncated = false;

    const worksheets = (workbook.worksheets || []).slice(0, maxSheets);
    if (workbook.worksheets.length > maxSheets) {
      isTruncated = true;
    }

    for (const ws of worksheets) {
      const rows = [];
      let maxCols = 0;

      ws.eachRow((row) => {
        if (totalCells >= maxCells) {
          isTruncated = true;
          return;
        }

        const rawValues = Array.isArray(row.values)
          ? row.values.slice(1) // ExcelJS rows are 1-indexed
          : [];

        if (rawValues.length > maxCols) maxCols = rawValues.length;

        const cleanValues = rawValues.map((val) => {
          totalCells++;
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') {
            // Formula result or rich text
            return String(val.result || val.text || JSON.stringify(val));
          }
          return String(val).replace(/[\r\n]+/g, ' ').trim();
        });

        rows.push(cleanValues.join(', '));
      });

      sheetsSummary.push({
        name: ws.name,
        rowCount: rows.length,
        columnCount: maxCols,
      });

      if (rows.length > 0) {
        sheetTexts.push(`--- Sheet: ${ws.name} ---\n${rows.join('\n')}`);
      }
    }

    const combined = sheetTexts.join('\n\n');
    const { text, isTruncated: textTruncated } = truncateText(combined, maxChars);

    return {
      text,
      sheetCount: workbook.worksheets.length,
      sheets: sheetsSummary,
      charCount: text.length,
      isTruncated: isTruncated || textTruncated,
      format: 'xlsx',
    };
  } catch (err) {
    logger.error('[documentParser] XLSX parsing failed:', { error: err.message });
    throw new BadRequestError(`Failed to parse XLSX document: ${err.message}`, 'XLSX_PARSE_FAILED');
  }
};

/**
 * Parses CSV text, handling quotes, delimiters, and defending against formula injection.
 *
 * @param {Buffer | string} input
 * @param {object} [options={}]
 * @returns {{
 *   text: string,
 *   rowCount: number,
 *   columnCount: number,
 *   charCount: number,
 *   isTruncated: boolean,
 *   format: 'csv',
 * }}
 */
export const parseCsv = (input, options = {}) => {
  const maxRows = options.maxRows || DOCUMENT_PARSING_LIMITS.MAX_CSV_ROWS;
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;

  const rawString = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const lines = rawString.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const rowCount = lines.length;
  const cappedLines = lines.slice(0, maxRows);
  let isTruncated = lines.length > maxRows;

  let maxCols = 0;
  const sanitizedLines = cappedLines.map((line) => {
    // Simple robust comma splitting respecting quotes
    const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (cells.length > maxCols) maxCols = cells.length;

    // Neutralize dangerous spreadsheet formula prefixes (=, +, -, @)
    const cleaned = cells.map((cell) => {
      const trimmed = cell.trim().replace(/^"|"$/g, '');
      if (/^[=+\-@]/.test(trimmed)) {
        return `'${trimmed}`;
      }
      return trimmed;
    });

    return cleaned.join(', ');
  });

  const fullText = sanitizedLines.join('\n');
  const boundCheck = truncateText(fullText, maxChars);
  if (boundCheck.isTruncated) isTruncated = true;

  return {
    text: boundCheck.text,
    rowCount,
    columnCount: maxCols,
    charCount: boundCheck.text.length,
    isTruncated,
    format: 'csv',
  };
};

/**
 * Parses plain text or Markdown documents.
 *
 * @param {Buffer | string} input
 * @param {'txt' | 'markdown'} [format='txt']
 * @param {object} [options={}]
 * @returns {{
 *   text: string,
 *   charCount: number,
 *   isTruncated: boolean,
 *   format: 'txt' | 'markdown',
 * }}
 */
export const parseText = (input, format = 'txt', options = {}) => {
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;
  const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');

  // Strip byte order mark (BOM) and normalize CRLF to LF
  const clean = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const { text, isTruncated } = truncateText(clean, maxChars);

  return {
    text,
    charCount: text.length,
    isTruncated,
    format,
  };
};

/**
 * Parses and formats a JSON document.
 *
 * @param {Buffer | string} input
 * @param {object} [options={}]
 * @returns {{
 *   text: string,
 *   data: any,
 *   charCount: number,
 *   isTruncated: boolean,
 *   format: 'json',
 * }}
 */
export const parseJson = (input, options = {}) => {
  const maxChars = options.maxChars || DOCUMENT_PARSING_LIMITS.MAX_TEXT_CHARS;
  const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new BadRequestError(`Invalid JSON structure: ${err.message}`, 'JSON_PARSE_FAILED');
  }

  const pretty = JSON.stringify(parsed, null, 2);
  const { text, isTruncated } = truncateText(pretty, maxChars);

  return {
    text,
    data: parsed,
    charCount: text.length,
    isTruncated,
    format: 'json',
  };
};

/**
 * Universal dispatcher for deterministic document parsing.
 * Infers format from MIME type and filename, invokes the specialized sub-parser,
 * and generates a concise preview snippet.
 *
 * @param {object} params
 * @param {Buffer} [params.buffer]
 * @param {string} [params.filePath]
 * @param {string} [params.mimeType='']
 * @param {string} [params.filename='']
 * @param {object} [params.options={}]
 * @returns {Promise<{
 *   text: string,
 *   preview: string,
 *   format: string,
 *   mimeType: string,
 *   charCount: number,
 *   isTruncated: boolean,
 *   pageCount?: number,
 *   sheetCount?: number,
 *   sheets?: Array<any>,
 *   isScanned?: boolean,
 * }>}
 */
export const parseDocument = async ({
  buffer,
  filePath,
  mimeType = '',
  filename = '',
  options = {},
}) => {
  let input = buffer;
  if (!input && filePath) {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestError(`Document file not found at: ${filePath}`, 'FILE_NOT_FOUND');
    }
    input = fs.readFileSync(filePath);
  }

  if (!input) {
    throw new BadRequestError('Either buffer or filePath is required for document parsing.', 'MISSING_PAYLOAD');
  }

  const mime = (mimeType || '').toLowerCase();
  const ext = path.extname(filename || filePath || '').toLowerCase();

  let result;

  // 1. PDF
  if (mime === 'application/pdf' || ext === '.pdf') {
    result = await parsePdf(input, options);
  }
  // 2. Microsoft Word DOCX
  else if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  ) {
    result = await parseDocx(input, options);
  }
  // 3. Microsoft Excel XLSX
  else if (
    mime.includes('spreadsheetml') ||
    mime === 'application/vnd.ms-excel' ||
    ext === '.xlsx' ||
    ext === '.xls'
  ) {
    result = await parseXlsx(input, options);
  }
  // 4. CSV
  else if (mime === 'text/csv' || ext === '.csv') {
    result = parseCsv(input, options);
  }
  // 5. Markdown
  else if (mime === 'text/markdown' || ext === '.md') {
    result = parseText(input, 'markdown', options);
  }
  // 6. JSON
  else if (mime === 'application/json' || ext === '.json') {
    result = parseJson(input, options);
  }
  // 7. Plain Text
  else if (mime.startsWith('text/') || ext === '.txt') {
    result = parseText(input, 'txt', options);
  }
  // Unsupported
  else {
    throw new BadRequestError(
      `Unsupported document format for text extraction: "${ext || mime || 'unknown'}".`,
      'UNSUPPORTED_DOCUMENT_FORMAT'
    );
  }

  // Generate a concise preview snippet for UI and fast indexing
  const preview = (result.text || '').slice(0, DOCUMENT_PARSING_LIMITS.PREVIEW_CHARS).trim();

  return {
    ...result,
    preview,
    mimeType: mime || 'text/plain',
  };
};
