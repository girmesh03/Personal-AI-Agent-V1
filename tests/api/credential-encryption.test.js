/**
 * @file tests/api/credential-encryption.test.js
 * @description Postman-style native HTTP and unit integration tests for Credential Envelope Encryption (NFR-SEC-002, Scenario U).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../../backend/src/app.js';
import { connectDB, disconnectDB } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { generateAccessToken } from '../../backend/src/infrastructure/security/tokenService.js';
import {
  encryptCredential,
  decryptCredential,
  rotateCredentialEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  redactCredential,
  getMasterKey,
} from '../../backend/src/modules/identity/services/credentialEncryption.js';

describe('Credential Envelope Encryption & BYOK Storage (Task 2.4 - NFR-SEC-002)', () => {
  let server;
  let baseUrl;
  let testUser;
  let validAccessToken;
  const testEmail = `byok.encryption.${Date.now()}@example.com`;

  before(async () => {
    await connectDB();

    testUser = await User.create({
      firstName: 'Crypto',
      lastName: 'Auditor',
      email: testEmail,
      password: 'Password123!@',
      position: 'Cryptographer',
    });

    validAccessToken = generateAccessToken(testUser._id);

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (testUser?._id) {
      await User.findByIdAndDelete(testUser._id);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Authenticated Envelope Encryption Primitives', () => {
    const rawSecret = 'AIzaSyTestGeminiApiKeySecret-987654321';
    const context = {
      userId: '60d5ec49f1b2c8b1f8e4e1a1',
      credentialType: 'geminiApiKey',
      keyVersion: 'v1',
    };

    it('encrypts plaintext into an AES-256-GCM envelope with unique 96-bit nonces', () => {
      const envelope1 = encryptCredential(rawSecret, context);
      const envelope2 = encryptCredential(rawSecret, context);

      assert.equal(envelope1.keyVersion, 'v1');
      assert.ok(envelope1.encryptedDek, 'Missing encrypted DEK');
      assert.ok(envelope1.ciphertext, 'Missing ciphertext');
      assert.ok(envelope1.authTag, 'Missing auth tag');
      assert.ok(envelope1.iv, 'Missing IV');

      // 12 bytes = 16 base64 characters
      const ivBuffer = Buffer.from(envelope1.iv, 'base64');
      assert.equal(ivBuffer.length, 12, 'IV must be exactly 12 bytes (96 bits) per NIST SP 800-38D');

      const dekIvBuffer = Buffer.from(envelope1.dekIv, 'base64');
      assert.equal(dekIvBuffer.length, 12, 'DEK IV must be exactly 12 bytes (96 bits)');

      // Nonces must be unique across successive encryptions of the same plaintext
      assert.notEqual(envelope1.iv, envelope2.iv, 'IV nonces must be uniquely generated');
      assert.notEqual(envelope1.ciphertext, envelope2.ciphertext, 'Ciphertexts must differ due to unique DEK/IV');
    });

    it('successfully decrypts an envelope back to the original plaintext', () => {
      const envelope = encryptCredential(rawSecret, context);
      const decrypted = decryptCredential(envelope, {
        userId: context.userId,
        credentialType: context.credentialType,
      });

      assert.equal(decrypted, rawSecret, 'Decrypted plaintext must match original secret');
    });

    it('fails decryption when AAD context is altered (context binding mismatch)', () => {
      const envelope = encryptCredential(rawSecret, context);

      // Different user ID
      assert.throws(
        () => {
          decryptCredential(envelope, {
            userId: '60d5ec49f1b2c8b1f8e4e999',
            credentialType: context.credentialType,
          });
        },
        /Credential decryption failed/,
        'Must reject decryption when user ID differs'
      );

      // Different credential type
      assert.throws(
        () => {
          decryptCredential(envelope, {
            userId: context.userId,
            credentialType: 'addisApiKey',
          });
        },
        /Credential decryption failed/,
        'Must reject decryption when credential type differs'
      );
    });

    it('fails decryption when ciphertext or authentication tag is tampered with', () => {
      const envelope = encryptCredential(rawSecret, context);

      // Tamper ciphertext
      const tamperedCiphertext = {
        ...envelope,
        ciphertext: Buffer.from('corrupted-ciphertext-content').toString('base64'),
      };
      assert.throws(
        () => {
          decryptCredential(tamperedCiphertext, {
            userId: context.userId,
            credentialType: context.credentialType,
          });
        },
        /Credential decryption failed/,
        'Must reject tampered ciphertext'
      );

      // Tamper auth tag
      const tamperedTag = {
        ...envelope,
        authTag: Buffer.from('corrupted-tag123').toString('base64'),
      };
      assert.throws(
        () => {
          decryptCredential(tamperedTag, {
            userId: context.userId,
            credentialType: context.credentialType,
          });
        },
        /Credential decryption failed/,
        'Must reject tampered authentication tag'
      );
    });

    it('supports envelope key rotation to a new key version', () => {
      const envelopeV1 = encryptCredential(rawSecret, { ...context, keyVersion: 'v1' });
      const envelopeV2 = rotateCredentialEnvelope(envelopeV1, {
        userId: context.userId,
        credentialType: context.credentialType,
        newKeyVersion: 'v2',
      });

      assert.equal(envelopeV2.keyVersion, 'v2');
      assert.notEqual(envelopeV1.encryptedDek, envelopeV2.encryptedDek);

      const decrypted = decryptCredential(envelopeV2, {
        userId: context.userId,
        credentialType: context.credentialType,
      });
      assert.equal(decrypted, rawSecret, 'Decrypted plaintext after rotation must match original secret');
    });

    it('serializes and deserializes envelopes safely', () => {
      const envelope = encryptCredential(rawSecret, context);
      const serialized = serializeEnvelope(envelope);
      assert.equal(typeof serialized, 'string');

      const deserialized = deserializeEnvelope(serialized);
      assert.equal(deserialized.ciphertext, envelope.ciphertext);

      // decryptCredential accepts serialized string directly
      const decrypted = decryptCredential(serialized, {
        userId: context.userId,
        credentialType: context.credentialType,
      });
      assert.equal(decrypted, rawSecret);
    });

    it('redacts credentials cleanly for logs and UI display', () => {
      assert.equal(redactCredential('sk-proj-1234567890abcdef1234'), 'sk-p...1234');
      assert.equal(redactCredential('short'), '********');
      assert.equal(redactCredential(null), 'Not Set');
      assert.equal(redactCredential(''), 'Not Set');
    });
  });

  describe('2. User Domain Model Integration', () => {
    it('stores encrypted envelope on user model and decrypts in volatile memory', async () => {
      const secretApiKey = 'gemini-prod-key-super-secret-12345';
      testUser.setEncryptedApiKey('geminiApiKey', secretApiKey);
      await testUser.save();

      // Reload raw record from MongoDB with select(+fields)
      const rawUser = await User.findById(testUser._id).select(
        '+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey'
      );

      assert.equal(rawUser.settings.apiKeys.hasGeminiKey, true);
      assert.ok(rawUser.settings.apiKeys.geminiApiKey, 'Raw record should store encrypted string');
      assert.notEqual(
        rawUser.settings.apiKeys.geminiApiKey,
        secretApiKey,
        'Database must NEVER store plaintext API key'
      );

      // Verify volatile in-memory decryption
      const recoveredKey = rawUser.getDecryptedApiKey('geminiApiKey');
      assert.equal(recoveredKey, secretApiKey, 'getDecryptedApiKey must recover original plaintext in memory');

      // Verify redacted representation
      const redacted = rawUser.getRedactedApiKey('geminiApiKey');
      assert.equal(redacted, 'gemi...2345');

      // Verify toJSON() never leaks serialized envelope or plaintext
      const jsonUser = rawUser.toJSON();
      assert.equal(jsonUser.settings.apiKeys.hasGeminiKey, true);
      assert.equal(jsonUser.settings.apiKeys.geminiApiKey, undefined, 'toJSON must not include geminiApiKey');
      assert.equal(jsonUser.settings.apiKeys.addisApiKey, undefined, 'toJSON must not include addisApiKey');
    });
  });

  describe('3. HTTP Endpoints for BYOK Credential Configuration', () => {
    it('rejects unauthenticated requests to PATCH /api/v1/users/api-keys with 401 UNAUTHENTICATED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/api-keys`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: 'ai-some-key' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error?.code, 'UNAUTHENTICATED');
    });

    it('updates user BYOK keys securely and returns masked status without leaking secrets', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/api-keys`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAccessToken}`,
        },
        body: JSON.stringify({
          geminiApiKey: 'AIzaSyCustomGeminiKey778899',
          addisApiKey: 'sk-addis-custom-token-112233',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.hasGeminiKey, true);
      assert.equal(data.data.hasAddisKey, true);
      assert.equal(data.data.geminiApiKey, undefined, 'API response must never include raw Gemini key');
      assert.equal(data.data.addisApiKey, undefined, 'API response must never include raw Addis key');

      // Verify DB record has ciphertext and IV
      const updatedUser = await User.findById(testUser._id).select(
        '+settings.apiKeys.geminiApiKey +settings.apiKeys.addisApiKey'
      );
      assert.ok(updatedUser.settings.apiKeys.geminiApiKey.length > 50);
      assert.notEqual(updatedUser.settings.apiKeys.geminiApiKey, 'AIzaSyCustomGeminiKey778899');
    });

    it('retrieves masked status from GET /api/v1/users/api-keys without exposing plain secrets', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/api-keys`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validAccessToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.hasGeminiKey, true);
      assert.equal(data.data.hasAddisKey, true);
      assert.equal(data.data.geminiApiKey, 'AIza...8899');
      assert.equal(data.data.addisApiKey, 'sk-a...2233');
    });
  });
});
