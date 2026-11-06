/**
 * @module modules/identity/services/credentialEncryption
 * @description Authenticated envelope encryption service for BYOK and integration credentials (NFR-SEC-002).
 * Implements AES-256-GCM with 96-bit unique nonces, external KEK, ephemeral DEK, user-bound AAD,
 * key versioning, rotation support, and redaction utilities.
 */

import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { BadRequestError } from '../../../shared/errors/AppError.js';

const GCM_IV_LENGTH_BYTES = 12; // 96 bits per NIST SP 800-38D
const DEFAULT_KEY_VERSION = 'v1';

/**
 * Derives a 256-bit (32-byte) Key Encryption Key (KEK) using HKDF.
 *
 * @param {string} version - KEK version identifier (e.g. 'v1')
 * @returns {Buffer} 32-byte master KEK
 */
export const getMasterKey = (version = DEFAULT_KEY_VERSION) => {
  const secret = env.CREDENTIAL_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET;
  const salt = Buffer.from(`operon-kek-salt-${version}`, 'utf8');
  const info = Buffer.from(`operon-credential-kek-${version}`, 'utf8');

  return Buffer.from(crypto.hkdfSync('sha256', secret, salt, info, 32));
};

/**
 * Builds user/credential-bound Authenticated Additional Data (AAD).
 * Binds the encryption to the exact owner and purpose to prevent ciphertext transposition attacks.
 *
 * @param {{ userId: string, credentialType: string, version?: string, role?: string }} context
 * @returns {Buffer}
 */
const buildAad = ({ userId, credentialType, version = DEFAULT_KEY_VERSION, role = 'payload' }) => {
  const payload = {
    u: String(userId),
    t: String(credentialType),
    v: String(version),
    r: String(role),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8');
};

/**
 * Encrypts a sensitive credential using envelope encryption (AES-256-GCM).
 *
 * @param {string} plaintext - Raw credential string
 * @param {{ userId: string, credentialType: string, keyVersion?: string }} context
 * @returns {{
 *   keyVersion: string,
 *   encryptedDek: string,
 *   dekIv: string,
 *   dekAuthTag: string,
 *   ciphertext: string,
 *   iv: string,
 *   authTag: string,
 *   aad: string,
 * }}
 */
export const encryptCredential = (plaintext, { userId, credentialType, keyVersion = DEFAULT_KEY_VERSION }) => {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new BadRequestError('Plaintext credential must be a non-empty string.', 'INVALID_CREDENTIAL');
  }
  if (!userId || !credentialType) {
    throw new BadRequestError('User ID and credential type are required for authenticated encryption binding.', 'MISSING_ENCRYPTION_CONTEXT');
  }

  const kek = getMasterKey(keyVersion);

  // 1. Generate unique ephemeral Data Encryption Key (DEK)
  const dek = crypto.randomBytes(32);
  const dekIv = crypto.randomBytes(GCM_IV_LENGTH_BYTES);
  const dekAad = buildAad({ userId, credentialType, version: keyVersion, role: 'dek' });

  // 2. Encrypt DEK with KEK
  const dekCipher = crypto.createCipheriv('aes-256-gcm', kek, dekIv);
  dekCipher.setAAD(dekAad);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  // 3. Encrypt payload with DEK
  const iv = crypto.randomBytes(GCM_IV_LENGTH_BYTES);
  const aad = buildAad({ userId, credentialType, version: keyVersion, role: 'payload' });

  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 4. Securely zero out ephemeral DEK memory
  dek.fill(0);

  return {
    keyVersion,
    encryptedDek: encryptedDek.toString('base64'),
    dekIv: dekIv.toString('base64'),
    dekAuthTag: dekAuthTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    aad: aad.toString('base64'),
  };
};

/**
 * Decrypts an envelope-encrypted credential, validating the auth tags and AAD context.
 *
 * @param {object|string} envelope - Envelope object or serialized envelope string
 * @param {{ userId: string, credentialType: string }} context
 * @returns {string} Decrypted plaintext credential
 */
export const decryptCredential = (envelope, { userId, credentialType }) => {
  if (!envelope) {
    throw new BadRequestError('Envelope data is required for decryption.', 'MISSING_ENVELOPE');
  }
  if (!userId || !credentialType) {
    throw new BadRequestError('User ID and credential type are required for authenticated decryption binding.', 'MISSING_DECRYPTION_CONTEXT');
  }

  const parsedEnvelope =
    typeof envelope === 'string'
      ? deserializeEnvelope(envelope)
      : envelope;

  const {
    keyVersion = DEFAULT_KEY_VERSION,
    encryptedDek,
    dekIv,
    dekAuthTag,
    ciphertext,
    iv,
    authTag,
  } = parsedEnvelope;

  let dek;
  try {
    const kek = getMasterKey(keyVersion);
    const dekAad = buildAad({ userId, credentialType, version: keyVersion, role: 'dek' });

    // 1. Decrypt DEK with KEK
    const dekDecipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(dekIv, 'base64'));
    dekDecipher.setAuthTag(Buffer.from(dekAuthTag, 'base64'));
    dekDecipher.setAAD(dekAad);
    dek = Buffer.concat([
      dekDecipher.update(Buffer.from(encryptedDek, 'base64')),
      dekDecipher.final(),
    ]);

    // 2. Decrypt payload with DEK
    const aad = buildAad({ userId, credentialType, version: keyVersion, role: 'payload' });
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    decipher.setAAD(aad);

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return plaintext;
  } catch (err) {
    throw new BadRequestError(
      'Credential decryption failed: authentication tag verification or context binding mismatch.',
      'DECRYPTION_FAILED'
    );
  } finally {
    if (dek && Buffer.isBuffer(dek)) {
      dek.fill(0);
    }
  }
};

/**
 * Re-encrypts an existing envelope under a new KEK version.
 *
 * @param {object|string} envelope
 * @param {{ userId: string, credentialType: string, newKeyVersion: string }} context
 * @returns {object} New envelope
 */
export const rotateCredentialEnvelope = (envelope, { userId, credentialType, newKeyVersion }) => {
  const plaintext = decryptCredential(envelope, { userId, credentialType });
  return encryptCredential(plaintext, { userId, credentialType, keyVersion: newKeyVersion });
};

/**
 * Serializes an envelope object into a compact base64-encoded string for persistence.
 *
 * @param {object} envelope
 * @returns {string}
 */
export const serializeEnvelope = (envelope) => {
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
};

/**
 * Deserializes a compact base64-encoded string back into an envelope object.
 *
 * @param {string} serializedStr
 * @returns {object}
 */
export const deserializeEnvelope = (serializedStr) => {
  try {
    const jsonStr = Buffer.from(serializedStr, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    throw new BadRequestError('Malformed serialized credential envelope.', 'INVALID_ENVELOPE_FORMAT');
  }
};

/**
 * Redacts a credential for safe user display or logs (e.g. "sk-1234567890" -> "sk-...7890").
 *
 * @param {string} [credential]
 * @returns {string} Redacted credential
 */
export const redactCredential = (credential) => {
  if (!credential || typeof credential !== 'string') return 'Not Set';
  const clean = credential.trim();
  if (clean.length <= 8) return '********';

  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}...${suffix}`;
};

export default {
  encryptCredential,
  decryptCredential,
  rotateCredentialEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  redactCredential,
  getMasterKey,
};
