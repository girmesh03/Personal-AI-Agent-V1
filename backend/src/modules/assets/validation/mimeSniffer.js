/**
 * @module modules/assets/validation/mimeSniffer
 * @description Deterministic MIME magic-byte sniffing and content signature validation.
 * Enforces strict content verification, rejecting malicious executables and declared-vs-actual MIME mismatches.
 */

import path from 'node:path';
import { BadRequestError } from '../../../shared/errors/AppError.js';
import { ASSET_CONSTANTS } from '../../../utils/constants.js';

/**
 * Checks if a buffer matches a specific byte sequence starting at an offset.
 *
 * @param {Buffer} buffer
 * @param {number[]} bytes
 * @param {number} [offset=0]
 * @returns {boolean}
 */
const matchBytes = (buffer, bytes, offset = 0) => {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
};

/**
 * Detects whether buffer starts with executable signatures.
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
export const isExecutable = (buf) => {
  if (!buf || buf.length < 2) return false;

  // Windows PE: MZ (0x4D, 0x5A)
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true;

  // Linux ELF: \x7FELF (0x7F, 0x45, 0x4C, 0x46)
  if (matchBytes(buf, [0x7f, 0x45, 0x4c, 0x46])) return true;

  // Java Bytecode: CA FE BA BE
  if (matchBytes(buf, [0xca, 0xfe, 0xba, 0xbe])) return true;

  // Mach-O binaries
  if (
    matchBytes(buf, [0xfe, 0xed, 0xfa, 0xce]) ||
    matchBytes(buf, [0xfe, 0xed, 0xfa, 0xcf]) ||
    matchBytes(buf, [0xce, 0xfa, 0xed, 0xfe]) ||
    matchBytes(buf, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return true;
  }

  // Shell script shebang: #!/
  if (matchBytes(buf, [0x23, 0x21, 0x2f])) return true;

  return false;
};

/**
 * Detects content signature from header bytes and filename.
 *
 * @param {Buffer} buf
 * @param {string} [filename='']
 * @returns {string | null} Detected MIME type or null if unrecognized
 */
export const detectMimeFromBytes = (buf, filename = '') => {
  if (!buf || buf.length === 0) return null;

  const ext = path.extname(filename).toLowerCase();

  // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (matchBytes(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matchBytes(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  // 3. JPEG: FF D8 FF
  if (matchBytes(buf, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  // 4. GIF: GIF87a or GIF89a
  if (
    matchBytes(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matchBytes(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'image/gif';
  }

  // 5. WebP: RIFF....WEBP (offset 0: RIFF, offset 8: WEBP)
  if (
    matchBytes(buf, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchBytes(buf, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  // 6. WAV: RIFF....WAVE (offset 0: RIFF, offset 8: WAVE)
  if (
    matchBytes(buf, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchBytes(buf, [0x57, 0x41, 0x56, 0x45], 8)
  ) {
    return 'audio/wav';
  }

  // 7. MP3: ID3 header (0x49, 0x44, 0x33) or MPEG sync frame (0xFF, 0xFB / 0xF3 / 0xF2)
  if (
    matchBytes(buf, [0x49, 0x44, 0x33]) ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }

  // 8. OGG: OggS (0x4F, 0x67, 0x67, 0x53)
  if (matchBytes(buf, [0x4f, 0x67, 0x67, 0x53])) {
    return 'audio/ogg';
  }

  // 9. FLAC: fLaC (0x66, 0x4C, 0x61, 0x43)
  if (matchBytes(buf, [0x66, 0x4c, 0x61, 0x43])) {
    return 'audio/flac';
  }

  // 10. WebM / Matroska EBML: 1A 45 DF A3
  if (matchBytes(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ext === '.webm' ? 'audio/webm' : 'video/webm';
  }

  // 11. MP4 / M4A: ftyp at offset 4
  if (matchBytes(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    if (ext === '.m4a' || ext === '.aac') return 'audio/mp4';
    return 'video/mp4';
  }

  // 12. ZIP containers (DOCX, XLSX, generic ZIP)
  if (matchBytes(buf, [0x50, 0x4b, 0x03, 0x04]) || matchBytes(buf, [0x50, 0x4b, 0x05, 0x06])) {
    if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/zip';
  }

  // 13. Text-based formats: Inspect sample string for SVG, JSON, CSV, Markdown, plain text
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  // Check for null bytes - binary files have null bytes, plain text formats should not
  const hasNullByte = sample.includes(0x00);
  if (!hasNullByte) {
    const textSample = sample.toString('utf8').trim();

    // SVG: starts with XML declaration or <svg
    if (/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(textSample)) {
      return 'image/svg+xml';
    }

    // JSON: starts with { or [
    if ((textSample.startsWith('{') && textSample.endsWith('}')) ||
        (textSample.startsWith('[') && textSample.endsWith(']'))) {
      try {
        JSON.parse(textSample);
        return 'application/json';
      } catch {
        // Not valid full json, continue
      }
    }

    if (ext === '.json') return 'application/json';
    if (ext === '.csv') return 'text/csv';
    if (ext === '.md') return 'text/markdown';
    if (ext === '.txt') return 'text/plain';

    // Generic text
    return 'text/plain';
  }

  return null;
};

/**
 * Sniffs and verifies the MIME type against the declared MIME type and original filename.
 * Throws BadRequestError if executable, unsupported, or if declared MIME contradicts file content.
 *
 * @param {Buffer} buffer - Initial file bytes (at least 512 bytes recommended)
 * @param {string} originalName - Client-provided original filename
 * @param {string} [declaredMime=''] - Client-provided Content-Type header
 * @returns {string} Verified, canonical MIME type
 * @throws {BadRequestError}
 */
export const sniffMimeType = (buffer, originalName, declaredMime = '') => {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError('Cannot sniff MIME type of empty file.', 'EMPTY_FILE');
  }

  // 1. Hard check: Executable rejection
  if (isExecutable(buffer)) {
    throw new BadRequestError(
      'Executable binaries, libraries, and shell scripts are strictly prohibited.',
      'EXECUTABLE_NOT_PERMITTED'
    );
  }

  // 2. Detect actual MIME from bytes
  const detectedMime = detectMimeFromBytes(buffer, originalName);

  if (!detectedMime) {
    throw new BadRequestError(
      `File content signature unrecognized for "${originalName}".`,
      'UNRECOGNIZED_FILE_SIGNATURE'
    );
  }

  // 3. Validate against allowed MIME whitelist
  const isAllowed = ASSET_CONSTANTS.ALLOWED_MIME_TYPES.includes(detectedMime);
  if (!isAllowed) {
    throw new BadRequestError(
      `MIME type "${detectedMime}" is not permitted for storage.`,
      'UNSUPPORTED_MIME_TYPE'
    );
  }

  // 4. Mismatch check: If declared MIME is given, ensure it is compatible with detected MIME
  if (declaredMime) {
    const cleanDeclared = declaredMime.split(';')[0].trim().toLowerCase();

    // Exact match or acceptable family match
    const isExactMatch = cleanDeclared === detectedMime;
    const isAudioFamilyMatch =
      cleanDeclared.startsWith('audio/') && detectedMime.startsWith('audio/');
    const isImageFamilyMatch =
      cleanDeclared.startsWith('image/') && detectedMime.startsWith('image/');
    const isTextFamilyMatch =
      (cleanDeclared.startsWith('text/') || cleanDeclared === 'application/json') &&
      (detectedMime.startsWith('text/') || detectedMime === 'application/json');

    if (!isExactMatch && !isAudioFamilyMatch && !isImageFamilyMatch && !isTextFamilyMatch) {
      throw new BadRequestError(
        `Declared MIME type "${cleanDeclared}" contradicts verified file content signature ("${detectedMime}").`,
        'INVALID_FILE_TYPE'
      );
    }
  }

  return detectedMime;
};
