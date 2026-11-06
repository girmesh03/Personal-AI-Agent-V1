/**
 * @module modules/documents/provenance/citationService
 * @description Durable citation, grounding, and provenance verification service (FR-CORE-DOC-003, FR-CORE-CONV-006).
 * Creates immutable citation records binding conversational claims to specific source assets,
 * representations, page ranges, and cryptographic checksums.
 */

import crypto from 'crypto';
import { BadRequestError } from '../../../shared/errors/AppError.js';

/**
 * Creates a structured citation referencing a source asset and its derived representation.
 *
 * @param {object} params
 * @param {import('../../assets/persistence/Asset.js').Asset} params.asset - Source Asset document
 * @param {import('../../assets/persistence/AssetRepresentation.js').AssetRepresentation|object} [params.representation] - Associated representation
 * @param {object} [params.location] - Location metadata (page, sheet, row, lineStart, lineEnd, timeOffsetSeconds)
 * @param {string} params.snippet - Quoted or grounded text snippet
 * @returns {object} Structured citation object
 */
export function createCitation({ asset, representation = null, location = {}, snippet = '' }) {
  if (!asset || !asset._id) {
    throw new BadRequestError('Valid source asset is required for citation generation.');
  }

  const citationId = crypto.randomUUID();
  const cleanSnippet = typeof snippet === 'string' ? snippet.trim().slice(0, 500) : '';

  return {
    citationId,
    assetId: asset._id.toString(),
    sourceName: asset.originalName || asset.sanitizedName,
    sourceChecksum: asset.sha256,
    mimeType: asset.mimeType,
    representationType: representation?.representationType || 'extracted_text',
    representationId: representation?._id ? representation._id.toString() : null,
    location: {
      page: location.page || null,
      sheet: location.sheet || null,
      row: location.row || null,
      lineStart: location.lineStart || null,
      lineEnd: location.lineEnd || null,
      timeOffsetSeconds: location.timeOffsetSeconds || null,
    },
    snippet: cleanSnippet,
    provenance: {
      pipeline: representation?.provenance?.pipeline || 'direct',
      engine: representation?.provenance?.engine || 'raw',
      verifiedAt: new Date().toISOString(),
    },
  };
}

/**
 * Verifies that a citation remains cryptographically valid against the source asset.
 *
 * @param {object} citation - Citation object
 * @param {import('../../assets/persistence/Asset.js').Asset} asset - Source asset document
 * @returns {boolean} True if checksums match and asset ID is consistent
 */
export function verifyCitationIntegrity(citation, asset) {
  if (!citation || !asset) return false;
  if (citation.assetId !== asset._id.toString()) return false;
  if (citation.sourceChecksum !== asset.sha256) return false;
  return true;
}

/**
 * Formats a citation into human-readable citation label.
 *
 * @param {object} citation
 * @returns {string} E.g., "Report.pdf (p. 4)" or "Data.xlsx (Sheet1)"
 */
export function formatCitationLabel(citation) {
  if (!citation) return '';
  const parts = [citation.sourceName];

  if (citation.location?.page) {
    parts.push(`p. ${citation.location.page}`);
  } else if (citation.location?.sheet) {
    parts.push(`Sheet: ${citation.location.sheet}${citation.location?.row ? ` (row ${citation.location.row})` : ''}`);
  } else if (citation.location?.timeOffsetSeconds !== null && citation.location?.timeOffsetSeconds !== undefined) {
    const mins = Math.floor(citation.location.timeOffsetSeconds / 60);
    const secs = Math.floor(citation.location.timeOffsetSeconds % 60).toString().padStart(2, '0');
    parts.push(`${mins}:${secs}`);
  }

  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0];
}

export default {
  createCitation,
  verifyCitationIntegrity,
  formatCitationLabel,
};
