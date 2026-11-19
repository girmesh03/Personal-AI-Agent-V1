/**
 * @module utils/crypto
 * @description Authenticated symmetric encryption (AES-256-GCM) engine for envelope-encrypting
 * user-supplied BYOK credentials, API keys, and third-party connector tokens at rest (Protocol 22).
 */

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const SALT = 'operon-byok-envelope-v1';

// Derive deterministic 32-byte master encryption key from dedicated ENCRYPTION_KEY (with JWT_ACCESS_SECRET fallback)
const MASTER_KEY = crypto.scryptSync(env.ENCRYPTION_KEY || env.JWT_ACCESS_SECRET, SALT, 32);

/**
 * Encrypts a sensitive plaintext secret string using AES-256-GCM.
 *
 * @function encryptSecret
 * @param {string} [plaintext] - Plain text credential to encrypt.
 * @returns {string|null} Encrypted representation formatted as `iv:authTag:ciphertext` in hex, or null.
 */
export const encryptSecret = (plaintext) => {
  if (!plaintext || typeof plaintext !== 'string' || !plaintext.trim()) {
    return plaintext ?? null;
  }

  // Already encrypted check: iv (24 hex) : tag (32 hex) : cipher
  if (/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(plaintext)) {
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts an AES-256-GCM encrypted credential string.
 *
 * @function decryptSecret
 * @param {string} [encryptedText] - Formatted as `iv:authTag:ciphertext` in hex.
 * @returns {string|null} Decrypted plain text string, or original value if not encrypted.
 */
export const decryptSecret = (encryptedText) => {
  if (!encryptedText || typeof encryptedText !== 'string') {
    return encryptedText ?? null;
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    return encryptedText; // Not in envelope format
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (!ivHex || !authTagHex || !cipherHex) {
    return encryptedText;
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
};

export default {
  encryptSecret,
  decryptSecret,
};
