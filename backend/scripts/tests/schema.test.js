/**
 * @file backend/scripts/tests/schema.test.js
 * @description Native integration test suite verifying all 6 Mongoose database models against live MongoDB Atlas replica set.
 */

import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/db.js';
import {
  User,
  Chat,
  Message,
  Asset,
  Branch,
  Report,
} from '../../src/models/index.js';
import {
  AI_PROVIDERS,
  AI_MODELS,
  CHAT_CONSTANTS,
  MESSAGE_CONSTANTS,
  ASSET_CONSTANTS,
  BRANCH_CONSTANTS,
  REPORT_CONSTANTS,
} from '../../src/utils/constants.js';
import {
  toEthiopianDateString,
  parseEthiopianToGregorianDate,
} from '../../src/utils/ethiopianCalendar.js';

/**
 * Executes the native Mongoose schema integration test suite against live MongoDB Atlas.
 * Verifies validation constraints, defaults, virtuals, immutability, index enforcement,
 * and cross-model relationships across User, Chat, Message, Asset, Branch, and Report.
 * @returns {Promise<void>}
 */
async function runSchemaTests() {
  console.log('🧪 Starting Native MongoDB Mongoose Schema Integration Test Suite...\n');

  await connectDB();

  let passedTests = 0;
  let failedTests = 0;

  /**
   * Helper function running an individual test assertion and recording pass/fail telemetry.
   * @param {string} name - Test description.
   * @param {() => Promise<void>} fn - Async test execution body.
   * @returns {Promise<void>}
   */
  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}:`, err.message);
      failedTests++;
    }
  }

  // Cleanup tracking arrays
  const createdUserIds = [];
  const createdChatIds = [];
  const createdMessageIds = [];
  const createdAssetIds = [];
  const createdBranchIds = [];
  const createdReportIds = [];

  try {
    // -------------------------------------------------------------------------
    // Test 1: User Model Creation & Invariants
    // -------------------------------------------------------------------------
    let testUser;
    await test('User: create user with bcrypt hashing, defaults, and virtual fullName', async () => {
      const email = `schema.test.${Date.now()}@operon.test`;
      testUser = await User.create({
        firstName: 'Dawit',
        lastName: 'Alemu',
        email,
        password: 'Password123!',
        position: 'Operations Manager',
      });
      createdUserIds.push(testUser._id);

      assert.ok(testUser._id, 'Expected user _id');
      assert.equal(testUser.fullName, 'Dawit Alemu', 'Expected fullName virtual to be Dawit Alemu');
      assert.equal(testUser.position, 'Operations Manager');
      assert.equal(testUser.authProvider, 'local');
      assert.equal(testUser.isPasswordSet, true);

      // Verify bcrypt password hashing
      assert.notEqual(testUser.password, 'Password123!', 'Password should be hashed');
      const isMatch = await testUser.comparePassword('Password123!');
      assert.equal(isMatch, true, 'comparePassword should match');

      // Verify default agentConfig & sttEngine
      assert.equal(testUser.settings.sttEngine, 'addis_ai');
      assert.equal(testUser.settings.agentConfig.defaultProvider, 'google');
      assert.equal(testUser.settings.agentConfig.defaultModel, 'gemini-3.1-flash-lite');
      assert.equal(testUser.settings.agentConfig.defaultThinkingBudget, 2048);
      assert.equal(testUser.settings.agentConfig.defaultTemperature, 1.0);
    });

    // -------------------------------------------------------------------------
    // Test 2: Asset Model Creation & User Avatar Linkage
    // -------------------------------------------------------------------------
    let avatarAsset;
    await test('Asset: create avatar asset and link to User.avatar', async () => {
      avatarAsset = await Asset.create({
        user: testUser._id,
        originalName: 'avatar-dawit.png',
        fileName: 'avatar-dawit-12345.png',
        fileExtension: '.png',
        mimeType: 'image/png',
        sizeBytes: 102400,
        modality: ASSET_CONSTANTS.MODALITY.IMAGE,
        kind: ASSET_CONSTANTS.KIND.USER_AVATAR,
        storage: {
          driver: ASSET_CONSTANTS.STORAGE_DRIVER.LOCAL,
          key: `avatars/${testUser._id}/avatar-dawit.png`,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        lifecycleStatus: ASSET_CONSTANTS.LIFECYCLE_STATUS.READY,
      });
      createdAssetIds.push(avatarAsset._id);

      testUser.avatar = avatarAsset._id;
      await testUser.save();

      const populatedUser = await User.findById(testUser._id).populate('avatar');
      assert.equal(String(populatedUser.avatar._id), String(avatarAsset._id));
      assert.equal(populatedUser.avatar.kind, 'user_avatar');
    });

    // -------------------------------------------------------------------------
    // Test 3: Chat Model Creation & LangGraph Thread DAG Lineage
    // -------------------------------------------------------------------------
    let testChat;
    await test('Chat: create thread with LangGraph thread mapping and default branches DAG', async () => {
      testChat = await Chat.create({
        user: testUser._id,
        title: 'Q1 Review & Branch Inspection Planning',
        activeBranchId: CHAT_CONSTANTS.DEFAULT_BRANCH_ID,
      });
      createdChatIds.push(testChat._id);

      assert.ok(testChat._id);
      assert.equal(testChat.activeBranchId, 'main');
      assert.equal(testChat.branches.length, 1);
      assert.equal(testChat.branches[0].branchId, 'main');
      assert.equal(testChat.branches[0].label, null);
      assert.equal(testChat.isArchived, false);
      assert.equal(testChat.hasActiveRun, false);
      assert.equal(testChat.langgraph.threadId, String(testChat._id));

      // Verify Chat has zero embedded messages array
      assert.equal(testChat.messages, undefined, 'Chat model must NOT contain embedded messages array');
    });

    // -------------------------------------------------------------------------
    // Test 4: Message Model Creation & Polymorphic Parts
    // -------------------------------------------------------------------------
    let userMsg;
    let assistantMsg;
    let docAsset;
    await test('Message: create user and assistant messages with polymorphic parts and asset linkage', async () => {
      docAsset = await Asset.create({
        user: testUser._id,
        originalName: 'inspection-summary.pdf',
        fileName: 'inspection-summary-12345.pdf',
        fileExtension: '.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 204800,
        modality: ASSET_CONSTANTS.MODALITY.DOCUMENT,
        kind: ASSET_CONSTANTS.KIND.CHAT_ATTACHMENT,
        storage: {
          driver: ASSET_CONSTANTS.STORAGE_DRIVER.LOCAL,
          key: `chats/${testUser._id}/inspection-summary.pdf`,
          checksumSha256: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        },
        lifecycleStatus: ASSET_CONSTANTS.LIFECYCLE_STATUS.READY,
        provenance: {
          chat: testChat._id,
          user: testUser._id,
        },
      });
      createdAssetIds.push(docAsset._id);

      // 1. User Message with text and asset
      userMsg = await Message.create({
        chat: testChat._id,
        user: testUser._id,
        role: 'user',
        sequence: 1,
        parts: [
          {
            type: 'text',
            text: 'Please analyze this inspection summary document.',
          },
          {
            type: 'asset',
            asset: docAsset._id,
            modality: 'document',
            role: 'user_upload',
          },
        ],
      });
      createdMessageIds.push(userMsg._id);

      assert.ok(userMsg._id);
      assert.equal(userMsg.sequence, 1);
      assert.equal(userMsg.parts.length, 2);
      assert.equal(userMsg.parts[0].type, 'text');
      assert.equal(userMsg.parts[1].type, 'asset');
      assert.equal(String(userMsg.assets[0]), String(docAsset._id), 'Pre-validate hook should sync assets array');
      assert.equal(userMsg.text, 'Please analyze this inspection summary document.');

      // 2. Assistant Message with text, tool call with approval status, and citation
      assistantMsg = await Message.create({
        chat: testChat._id,
        user: testUser._id,
        role: 'assistant',
        sequence: 2,
        parentMessageId: userMsg._id,
        provider: 'google',
        model: 'gemini-3.1-flash-lite',
        parts: [
          {
            type: 'text',
            text: 'I will inspect the branches referenced in the document.',
          },
          {
            type: 'tool',
            toolCallId: 'call_lookup_001',
            toolName: 'lookup_user_branches',
            args: { search: 'Bole' },
            state: 'approval-requested',
            approval: {
              interruptId: 'intr_001',
              payloadHash: 'hash_001',
              status: 'pending',
            },
          },
          {
            type: 'citation',
            sourceType: 'url',
            title: 'Operations Manual §4.2',
            url: 'https://docs.operon.local/operations-manual',
            quoteSnippet: 'Inspection protocols require branch manager interview.',
          },
        ],
      });
      createdMessageIds.push(assistantMsg._id);

      assert.ok(assistantMsg._id);
      assert.equal(assistantMsg.sequence, 2);
      assert.equal(assistantMsg.parts.length, 3);
      assert.equal(assistantMsg.toolCallCount, 1);
      assert.equal(assistantMsg.citationCount, 1);
    });

    // -------------------------------------------------------------------------
    // Test 5: Multimodal Message Invariants (Anti-Trap §4.5 & §22)
    // -------------------------------------------------------------------------
    await test('Message: audio-only/asset-only allowed; empty text with 0 assets rejected', async () => {
      // Empty text with zero assets must fail validation
      await assert.rejects(
        () =>
          Message.create({
            chat: testChat._id,
            user: testUser._id,
            role: 'user',
            sequence: 3,
            parts: [{ type: 'text', text: '   ' }],
          }),
        /User message must include non-empty text/
      );

      // Audio-only or asset-only message without text must succeed cleanly
      const assetOnlyMsg = await Message.create({
        chat: testChat._id,
        user: testUser._id,
        role: 'user',
        sequence: 3,
        parts: [
          {
            type: 'asset',
            asset: docAsset._id,
            modality: 'document',
            role: 'user_upload',
          },
        ],
      });
      createdMessageIds.push(assetOnlyMsg._id);
      assert.ok(assetOnlyMsg._id);
      assert.equal(assetOnlyMsg.parts.length, 1);
      assert.equal(assetOnlyMsg.parts[0].type, 'asset');
    });

    // -------------------------------------------------------------------------
    // Test 6: Branch Model & Deletion Safeguards
    // -------------------------------------------------------------------------
    let testBranch;
    const branchCode = `BOLE-${Date.now().toString().slice(-4)}`;
    await test('Branch: create physical branch with code and validation', async () => {
      testBranch = await Branch.create({
        user: testUser._id,
        name: 'Bole Medhanialem Branch',
        code: branchCode,
        operationalStatus: BRANCH_CONSTANTS.DEFAULT_OPERATIONAL_STATUS,
        city: 'Addis Ababa',
        subcity: 'Bole',
        address: 'Cameroon St, Near Medhanialem Mall',
      });
      createdBranchIds.push(testBranch._id);

      assert.ok(testBranch._id);
      assert.equal(testBranch.name, 'Bole Medhanialem Branch');
      assert.equal(testBranch.code, branchCode);
      assert.equal(testBranch.isArchived, false);

      // Initially, with no reports, canDeletePermanently must return true
      const canDelete = await Branch.canDeletePermanently({
        userId: testUser._id,
        branchId: testBranch._id,
      });
      assert.equal(canDelete, true);
    });

    // -------------------------------------------------------------------------
    // Test 7: Report Model (Streamlined Architecture, JDN Virtuals & Zero Subdocuments)
    // -------------------------------------------------------------------------
    let testReport;
    const reportDate = new Date('2026-11-11T14:30:00.000Z'); // Has time component
    await test('Report: create streamlined report with UTC midnight date truncation and derived JDN virtuals', async () => {
      testReport = await Report.create({
        user: testUser._id,
        branch: testBranch._id,
        date: reportDate,
        clockIn: '08:30',
        clockOut: '17:00',
        visits: [
          {
            clockIn: '08:30',
            clockOut: '12:00',
          },
        ],
        narration: 'Comprehensive morning inspection conducted at Bole Medhanialem Branch. All refrigeration units operational.',
        activities: [
          {
            text: 'Audited fresh inventory and hygiene logs.',
            status: 'completed',
          },
        ],
        issues: [
          {
            text: 'Minor seal wear observed on freezer unit #2.',
            status: 'reported',
          },
        ],
        comments: [
          {
            text: 'Manager informed to schedule technician visit before Friday.',
          },
        ],
        assets: [docAsset._id],
      });
      createdReportIds.push(testReport._id);

      assert.ok(testReport._id);
      assert.equal(String(testReport.branch), String(testBranch._id));
      assert.equal(testReport.narration.startsWith('Comprehensive morning inspection'), true);

      // Verify date normalized to UTC midnight
      assert.equal(testReport.date.toISOString(), '2026-11-11T00:00:00.000Z');

      // Verify virtual getters
      assert.equal(testReport.dateString, '2026-11-11');
      assert.equal(testReport.ethiopianDate, '02-03-19');

      // Verify zero subdocument IDs on array items
      assert.equal(testReport.visits[0]._id, undefined, 'Visits must not have _id');
      assert.equal(testReport.activities[0]._id, undefined, 'Activities must not have _id');
      assert.equal(testReport.issues[0]._id, undefined, 'Issues must not have _id');
      assert.equal(testReport.comments[0]._id, undefined, 'Comments must not have _id');
    });

    // -------------------------------------------------------------------------
    // Test 8: Report Compound Partial Unique Index Enforcement
    // -------------------------------------------------------------------------
    await test('Report: duplicate report on same date/branch/user rejected by partial unique index', async () => {
      await assert.rejects(
        () =>
          Report.create({
            user: testUser._id,
            branch: testBranch._id,
            date: new Date('2026-11-11T00:00:00.000Z'),
            clockIn: '09:00',
            clockOut: '18:00',
            narration: 'Duplicate report attempt for the same branch and date.',
          }),
        /E11000 duplicate key error/
      );
    });

    // -------------------------------------------------------------------------
    // Test 9: Branch Cascading Deletion Blocked when Audit Reports Exist
    // -------------------------------------------------------------------------
    await test('Branch: deletion fails closed if audit reports exist for branch', async () => {
      const canDelete = await Branch.canDeletePermanently({
        userId: testUser._id,
        branchId: testBranch._id,
      });
      assert.equal(canDelete, false, 'canDeletePermanently must be false when report exists');

      // Attempting to delete the branch via document deleteOne must fail
      await assert.rejects(
        () => testBranch.deleteOne(),
        /Cannot delete branch with existing audit reports/
      );

      // Attempting to delete the branch via query findOneAndDelete must fail
      await assert.rejects(
        () => Branch.findOneAndDelete({ _id: testBranch._id, user: testUser._id }),
        /Cannot delete branch with existing audit reports/
      );
    });

    // -------------------------------------------------------------------------
    // Test 10: Single-User Ownership Immutability Guard
    // -------------------------------------------------------------------------
    await test('Immutability: modifying user or _id via findOneAndUpdate is blocked', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await assert.rejects(
        () =>
          Chat.findOneAndUpdate(
            { _id: testChat._id, user: testUser._id },
            { $set: { user: otherUserId } }
          ),
        /(Cannot modify immutable field "user"|Cannot mutate immutable Chat field)/
      );

      await assert.rejects(
        () =>
          Report.findOneAndUpdate(
            { _id: testReport._id, user: testUser._id },
            { $set: { user: otherUserId } }
          ),
        /(Cannot modify immutable field "user"|Cannot mutate immutable Chat field)/
      );
    });

    // -------------------------------------------------------------------------
    // Test 11: Static Query Helper Resolvers
    // -------------------------------------------------------------------------
    await test('Report: buildIdentifierQuery resolves ObjectId, Gregorian, and Ethiopian date queries', async () => {
      // 1. Resolve by MongoId
      const qId = Report.buildIdentifierQuery({
        identifier: String(testReport._id),
        userId: testUser._id,
      });
      assert.equal(String(qId._id), String(testReport._id));

      // 2. Resolve by Gregorian Date
      const qGreg = Report.buildIdentifierQuery({
        identifier: '2026-11-11',
        userId: testUser._id,
        branchId: testBranch._id,
      });
      assert.equal(qGreg.date.toISOString(), '2026-11-11T00:00:00.000Z');
      assert.equal(String(qGreg.branch), String(testBranch._id));

      // 3. Resolve by Ethiopian Date with slash conversion
      const qEth = Report.buildIdentifierQuery({
        identifier: '02/03/2019',
        userId: testUser._id,
        branchId: testBranch._id,
      });
      assert.equal(qEth.date.toISOString(), '2026-11-11T00:00:00.000Z');
      assert.equal(String(qEth.branch), String(testBranch._id));
    });

  } finally {
    console.log('\n🧹 Cleaning up test database records...');
    try {
      if (createdReportIds.length > 0) {
        // Mark reports as archived first to allow permanent cleanup
        await Report.updateMany({ _id: { $in: createdReportIds } }, { $set: { isArchived: true } });
        await Report.deleteMany({ _id: { $in: createdReportIds } });
      }
      if (createdBranchIds.length > 0) {
        await Branch.deleteMany({ _id: { $in: createdBranchIds } });
      }
      if (createdMessageIds.length > 0) {
        await Message.deleteMany({ _id: { $in: createdMessageIds } });
      }
      if (createdChatIds.length > 0) {
        await Chat.deleteMany({ _id: { $in: createdChatIds } });
      }
      if (createdAssetIds.length > 0) {
        await Asset.deleteMany({ _id: { $in: createdAssetIds } });
      }
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      console.log('✔ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Error during test cleanup:', cleanupErr);
    }

    await disconnectDB();
  }

  console.log('\n============================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSchemaTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
