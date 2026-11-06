/**
 * @file tests/api/identity-models.test.js
 * @description Native integration tests for User, Session, and AuthIdentity domain models.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB, isDbConnected } from '../../backend/src/infrastructure/database/connection.js';
import { User } from '../../backend/src/modules/identity/domain/User.js';
import { Session, hashRefreshToken } from '../../backend/src/modules/identity/domain/Session.js';
import { AuthIdentity } from '../../backend/src/modules/identity/domain/AuthIdentity.js';
import { UnauthenticatedError } from '../../backend/src/shared/errors/AppError.js';

describe('Identity & Session Domain Models Integration Tests', () => {
  const testEmail = `test.user.${Date.now()}@example.com`;
  const rawPassword = 'ValidPassword123!';
  let createdUser;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    if (createdUser?._id) {
      await User.deleteOne({ _id: createdUser._id });
      await Session.deleteMany({ userId: createdUser._id });
      await AuthIdentity.deleteMany({ userId: createdUser._id });
    }
    await disconnectDB();
  });

  it('Verifies MongoDB connection lifecycle engine is connected', () => {
    assert.equal(isDbConnected(), true);
  });

  it('Creates a User and hashes the password via bcrypt pre-save hook', async () => {
    createdUser = await User.create({
      firstName: 'Abebe',
      lastName: 'Kebede',
      email: testEmail,
      password: rawPassword,
      position: 'Area Supervisor',
      settings: {
        apiKeys: {
          geminiApiKey: 'secret-gemini-key',
        },
      },
      integrations: {
        googleDrive: {
          connected: true,
          accessToken: 'sensitive-access-token',
          refreshToken: 'sensitive-refresh-token',
        },
        telegram: {
          connected: true,
          botToken: 'secret-telegram-bot-token',
        },
      },
    });

    assert.ok(createdUser._id);
    assert.equal(createdUser.fullName, 'Abebe Kebede');
    assert.notEqual(createdUser.password, rawPassword);
    assert.ok(createdUser.password.startsWith('$2')); // bcrypt hash signature
  });

  it('Validates correct password with comparePassword and rejects invalid password', async () => {
    const isMatch = await createdUser.comparePassword(rawPassword);
    assert.equal(isMatch, true);

    const isWrongMatch = await createdUser.comparePassword('WrongPassword999!');
    assert.equal(isWrongMatch, false);
  });

  it('Sanitizes sensitive credentials and secrets in User.toJSON()', () => {
    const json = createdUser.toJSON();

    assert.equal(json.password, undefined);
    assert.equal(json.__v, undefined);
    assert.equal(json.integrations?.googleDrive?.accessToken, undefined);
    assert.equal(json.integrations?.googleDrive?.refreshToken, undefined);
    assert.equal(json.integrations?.telegram?.botToken, undefined);
    assert.equal(json.settings?.apiKeys?.geminiApiKey, undefined);
    assert.equal(json.settings?.apiKeys?.hasGeminiKey, true);
    assert.equal(json.settings?.apiKeys?.hasAddisKey, false);
  });

  it('Creates, validates, and rotates sessions within the same family lineage', async () => {
    const token1 = 'refresh_token_1_alpha';
    const token2 = 'refresh_token_2_beta';

    // 1. Create initial session
    const session1 = await Session.createSession({
      userId: createdUser._id,
      refreshToken: token1,
      userAgent: 'TestBrowser/1.0',
      ipAddress: '127.0.0.1',
    });

    assert.ok(session1._id);
    assert.ok(session1.family);
    assert.equal(session1.isRevoked, false);
    assert.equal(session1.refreshTokenHash, hashRefreshToken(token1));

    // 2. Validate session1
    const validated1 = await Session.validateSession(token1);
    assert.equal(validated1._id.toString(), session1._id.toString());

    // 3. Rotate session from token1 -> token2
    const session2 = await Session.rotateSession({
      oldRefreshToken: token1,
      newRefreshToken: token2,
      userAgent: 'TestBrowser/2.0',
    });

    assert.ok(session2._id);
    assert.equal(session2.family, session1.family); // Preserves lineage family!
    assert.equal(session2.isRevoked, false);

    // Verify session1 is now marked revoked
    const updatedSession1 = await Session.findById(session1._id);
    assert.equal(updatedSession1.isRevoked, true);

    // 4. Validate session2 succeeds
    const validated2 = await Session.validateSession(token2);
    assert.equal(validated2._id.toString(), session2._id.toString());
  });

  it('Detects refresh token replay attack and terminates entire session family', async () => {
    const token1 = 'refresh_token_1_alpha'; // This was already rotated above!
    const token2 = 'refresh_token_2_beta';

    // Attempting to validate or rotate the already rotated token1 must trigger breach detection!
    await assert.rejects(
      async () => {
        await Session.validateSession(token1);
      },
      (err) => {
        assert.ok(err instanceof UnauthenticatedError);
        assert.equal(err.errorCode, 'TOKEN_REUSE_DETECTED');
        return true;
      }
    );

    // Verify that session2 (which was in the same family) was ALSO revoked automatically
    const session2AfterBreach = await Session.findOne({
      refreshTokenHash: hashRefreshToken(token2),
    });
    assert.equal(session2AfterBreach.isRevoked, true);
  });

  it('Creates and links an AuthIdentity record for Google SSO', async () => {
    const googleSubjectId = `google_sub_${Date.now()}`;

    const identity = await AuthIdentity.create({
      userId: createdUser._id,
      provider: 'google',
      providerId: googleSubjectId,
      email: testEmail,
      profileData: {
        name: 'Abebe Kebede',
        picture: 'https://example.com/avatar.jpg',
      },
    });

    assert.ok(identity._id);
    assert.equal(identity.provider, 'google');
    assert.equal(identity.providerId, googleSubjectId);

    // Verify duplicate identity rejection
    await assert.rejects(async () => {
      await AuthIdentity.create({
        userId: createdUser._id,
        provider: 'google',
        providerId: googleSubjectId,
      });
    });
  });
});
