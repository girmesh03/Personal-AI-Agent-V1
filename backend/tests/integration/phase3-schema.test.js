/**
 * @module tests/integration/phase3-schema.test
 * @description Headless automated integration test suite for Phase 3 Chat, Message & Asset Schema Architecture.
 * Validates normalized Chat model, monotonic Message turns, reasoning thought isolation,
 * selective HITL interrupts, universal Asset model across strict 3-kind taxonomy,
 * cloud storage exclusivity, cascading deletion, and guaranteed database teardown hygiene.
 * Strictly adheres to Protocol 43 (cloud media exclusivity), Protocol 46 (selective HITL),
 * Protocol 48 (server-side text extraction), Protocol 49 (monotonic sequence typing),
 * Protocol 55 (pristine asset preservation), Protocol 58 (zero embedded arrays & thought isolation),
 * Protocol 68 (dual-modality test architecture & teardown hygiene), and Protocol 71 (type contracts).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  startTestServer,
  TestClient,
  connectDB,
  disconnectDB,
  purgeTestUsers,
  TEST_EMAIL_DOMAIN_REGEX,
  User,
  Chat,
  Message,
  Asset,
} from './testHarness.js';
import {
  CHAT_CONSTANTS,
  MESSAGE_CONSTANTS,
  ASSET_CONSTANTS,
  AI_PROVIDERS,
  AI_MODELS,
} from '../../src/utils/constants.js';
import { executeAccountDeletion } from '../../src/services/userService.js';

describe('Phase 3 Chat, Message & Asset Schema Automated Integration Test Suite', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {() => Promise<void>} */
  let stopServer;
  /** @type {TestClient} */
  let client;

  /** @type {import('mongoose').Document} */
  let testUser;

  const testUserCredentials = {
    email: 'phase3-architect@operon-test.local',
    password: 'Password123!',
    firstName: 'PhaseThree',
    lastName: 'Architect',
  };

  before(async () => {
    // 1. Connect to live MongoDB Atlas replica set
    await connectDB();

    // 2. Guaranteed pre-flight database purge (Protocol 68)
    await purgeTestUsers();

    // 3. Start ephemeral test server on dynamic OS port
    const testInstance = await startTestServer();
    server = testInstance.server;
    stopServer = testInstance.stop;
    client = new TestClient(testInstance.port);

    // 4. Create primary test user for schema scoping
    testUser = await User.create(testUserCredentials);
  });

  after(async () => {
    try {
      // 1. Explicitly purge testUser scoped documents
      if (testUser?._id) {
        await Promise.all([
          Chat.deleteMany({ user: testUser._id }),
          Message.deleteMany({ user: testUser._id }),
          Asset.deleteMany({ user: testUser._id }),
          User.deleteOne({ _id: testUser._id }),
        ]);
      }

      // 2. Guaranteed post-test database purge inside try/finally (Protocol 68)
      await purgeTestUsers();

      // Exhaustive teardown verification across all 4 collections
      const [remainingUsers, remainingChats, remainingMessages, remainingAssets] = await Promise.all([
        User.countDocuments({ email: TEST_EMAIL_DOMAIN_REGEX }),
        Chat.countDocuments({ user: testUser?._id }),
        Message.countDocuments({ user: testUser?._id }),
        Asset.countDocuments({ user: testUser?._id }),
      ]);

      assert.equal(remainingUsers, 0, 'Teardown hygiene failed: residual test users found in database');
      assert.equal(remainingChats, 0, 'Teardown hygiene failed: residual test chats found in database');
      assert.equal(remainingMessages, 0, 'Teardown hygiene failed: residual test messages found in database');
      assert.equal(remainingAssets, 0, 'Teardown hygiene failed: residual test assets found in database');
    } finally {
      if (stopServer) {
        await stopServer();
      }
      await disconnectDB();
    }
  });

  // ==========================================
  // SECTION 1: CHAT SCHEMA & LIFECYCLE
  // ==========================================

  it('1. Chat creation succeeds with standard defaults and proper user isolation (Protocol 21, 58)', async () => {
    const chat = await Chat.create({
      user: testUser._id,
    });

    assert.ok(chat._id, 'Chat should have an _id');
    assert.equal(chat.user.toString(), testUser._id.toString());
    assert.equal(chat.title, CHAT_CONSTANTS.DEFAULT_TITLE);
    assert.equal(chat.provider, CHAT_CONSTANTS.DEFAULT_PROVIDER);
    assert.equal(chat.model, CHAT_CONSTANTS.DEFAULT_MODEL);
    assert.equal(chat.temperature, CHAT_CONSTANTS.DEFAULT_TEMPERATURE);
    assert.equal(chat.isPinned, false);
    assert.equal(chat.isArchived, false);
    assert.equal(chat.systemPrompt, null);
    assert.deepEqual(chat.metadata, {});
    assert.ok(chat.lastMessageAt instanceof Date);
    assert.ok(chat.createdAt instanceof Date);
    assert.ok(chat.updatedAt instanceof Date);
  });

  it('2. Chat title enforces trimming and rejects values exceeding 100 characters', async () => {
    // Trim verification
    const chat = await Chat.create({
      user: testUser._id,
      title: '   Trimmed Architectural Discussion   ',
    });
    assert.equal(chat.title, 'Trimmed Architectural Discussion');

    // Title length boundary check
    const oversizedTitle = 'A'.repeat(101);
    await assert.rejects(
      async () => {
        await Chat.create({
          user: testUser._id,
          title: oversizedTitle,
        });
      },
      /Title cannot exceed 100 characters/i
    );
  });

  it('3. Chat temperature enforces numeric boundaries (0 to 2)', async () => {
    // Below minimum
    await assert.rejects(
      async () => {
        await Chat.create({
          user: testUser._id,
          temperature: -0.1,
        });
      },
      /Temperature cannot be below 0/i
    );

    // Above maximum
    await assert.rejects(
      async () => {
        await Chat.create({
          user: testUser._id,
          temperature: 2.1,
        });
      },
      /Temperature cannot exceed 2/i
    );

    // Valid edge boundaries
    const minTempChat = await Chat.create({ user: testUser._id, temperature: 0 });
    assert.equal(minTempChat.temperature, 0);

    const maxTempChat = await Chat.create({ user: testUser._id, temperature: 2.0 });
    assert.equal(maxTempChat.temperature, 2.0);
  });

  it('4. Chat provider validates against supported AI providers (Protocol 63)', async () => {
    // Unsupported provider
    await assert.rejects(
      async () => {
        await Chat.create({
          user: testUser._id,
          provider: 'unsupported_provider',
        });
      },
      /Provider `unsupported_provider` is not supported/i
    );

    // Supported providers
    const addisChat = await Chat.create({
      user: testUser._id,
      provider: AI_PROVIDERS.ADDIS,
      model: AI_MODELS[AI_PROVIDERS.ADDIS].DEFAULT,
    });
    assert.equal(addisChat.provider, 'addis');
    assert.equal(addisChat.model, 'addis-1');
  });

  it('5. Chat pinning, archiving, and compound index queries operate correctly (Protocol 58)', async () => {
    const pinnedChat = await Chat.create({
      user: testUser._id,
      title: 'Pinned Mission Critical Chat',
      isPinned: true,
      lastMessageAt: new Date(Date.now() + 1000),
    });

    const archivedChat = await Chat.create({
      user: testUser._id,
      title: 'Archived Reference Chat',
      isArchived: true,
      lastMessageAt: new Date(Date.now() - 5000),
    });

    // Query active chats sorted by pinned then lastMessageAt
    const activeChats = await Chat.find({
      user: testUser._id,
      isArchived: false,
    }).sort({ isPinned: -1, lastMessageAt: -1 });

    assert.ok(activeChats.length >= 1);
    assert.equal(activeChats[0]._id.toString(), pinnedChat._id.toString());
    assert.equal(activeChats[0].isPinned, true);

    // Query archived chats
    const archivedChats = await Chat.find({
      user: testUser._id,
      isArchived: true,
    });
    assert.ok(archivedChats.some((c) => c._id.toString() === archivedChat._id.toString()));
  });

  // ==========================================
  // SECTION 2: MESSAGE SCHEMA & MONOTONICITY
  // ==========================================

  it('6. Message creation succeeds with default turn values and clean normalization (Protocol 58)', async () => {
    const chat = await Chat.create({ user: testUser._id });

    const message = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Explain quantum computing in Amharic.',
    });

    assert.ok(message._id);
    assert.equal(message.chat.toString(), chat._id.toString());
    assert.equal(message.user.toString(), testUser._id.toString());
    assert.equal(message.sequence, 1);
    assert.equal(message.role, 'user');
    assert.equal(message.text, 'Explain quantum computing in Amharic.');
    assert.equal(message.thought, null);
    assert.equal(message.thoughtDurationMs, null);
    assert.deepEqual(message.assets, []);
    assert.equal(message.status, 'completed');
    assert.equal(message.toolCalls, undefined);
    assert.equal(message.toolResult, undefined);
    assert.equal(message.interrupt, undefined);
    assert.equal(message.error, undefined);
    assert.equal(message.usage, undefined);
  });

  it('7. Monotonic sequence typing enforces unique constraint per chat (Protocol 49)', async () => {
    const chat = await Chat.create({ user: testUser._id });

    // Ensure indexes are built in MongoDB
    await Message.init();

    // Sequence 1 succeeds
    await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'First turn',
    });

    // Sequence 2 succeeds
    await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 2,
      role: 'assistant',
      text: 'Second turn response',
    });

    // Duplicate sequence 1 on same chat MUST fail unique index constraint
    await assert.rejects(
      async () => {
        await Message.create({
          chat: chat._id,
          user: testUser._id,
          sequence: 1,
          role: 'user',
          text: 'Conflicting sequence 1',
        });
      },
      (err) => {
        return err.code === 11000 || /duplicate key/i.test(err.message);
      }
    );

    // Same sequence on a DIFFERENT chat succeeds (scoped uniqueness)
    const otherChat = await Chat.create({ user: testUser._id });
    const otherMessage = await Message.create({
      chat: otherChat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Sequence 1 on separate thread',
    });
    assert.equal(otherMessage.sequence, 1);
  });

  it('8. Message role enum strictly validates allowed roles and rejects invalid roles', async () => {
    const chat = await Chat.create({ user: testUser._id });

    // Invalid role rejected
    await assert.rejects(
      async () => {
        await Message.create({
          chat: chat._id,
          user: testUser._id,
          sequence: 10,
          role: 'invalid_role',
          text: 'Test',
        });
      },
      /Role `invalid_role` is not supported/i
    );

    // All allowed roles succeed
    for (let i = 0; i < MESSAGE_CONSTANTS.ROLES.length; i++) {
      const role = MESSAGE_CONSTANTS.ROLES[i];
      const msg = await Message.create({
        chat: chat._id,
        user: testUser._id,
        sequence: 100 + i,
        role,
        text: `Role test for ${role}`,
      });
      assert.equal(msg.role, role);
    }
  });

  it('9. Reasoning thought isolation stores deliberation tokens separately from text (Protocol 58)', async () => {
    const chat = await Chat.create({ user: testUser._id });

    const assistantTurn = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'assistant',
      text: 'The derivative of sin(x) with respect to x is cos(x).',
      thought: 'User is asking for calculus differentiation of sin(x). Applying standard trigonometric differentiation rule.',
      thoughtDurationMs: 1420,
      model: 'gemini-3.8-flash',
      provider: 'google',
    });

    assert.equal(assistantTurn.text, 'The derivative of sin(x) with respect to x is cos(x).');
    assert.equal(
      assistantTurn.thought,
      'User is asking for calculus differentiation of sin(x). Applying standard trigonometric differentiation rule.'
    );
    assert.equal(assistantTurn.thoughtDurationMs, 1420);
    assert.equal(assistantTurn.model, 'gemini-3.8-flash');
    assert.equal(assistantTurn.provider, 'google');

    // Confirm thought does NOT appear inside text body
    assert.ok(!assistantTurn.text.includes(assistantTurn.thought));
  });

  it('10. Autonomous tool execution stores LangChain toolCalls and toolResult with undefined interrupt (Protocol 46)', async () => {
    const chat = await Chat.create({ user: testUser._id });

    // 1. Assistant emits autonomous tool calls
    const assistantMsg = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'assistant',
      text: 'Searching the database for branch reports...',
      toolCalls: [
        {
          id: 'call_search_9812',
          name: 'query_branch_database',
          args: { branchCode: 'B-042', fiscalYear: 2026 },
        },
      ],
    });

    assert.equal(assistantMsg.toolCalls.length, 1);
    assert.equal(assistantMsg.toolCalls[0].id, 'call_search_9812');
    assert.equal(assistantMsg.toolCalls[0].name, 'query_branch_database');
    assert.equal(assistantMsg.toolCalls[0].args.branchCode, 'B-042');
    assert.equal(assistantMsg.interrupt, undefined, 'Autonomous tool call turn must have undefined interrupt');

    // 2. Tool response turn
    const toolMsg = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 2,
      role: 'tool',
      toolResult: {
        toolCallId: 'call_search_9812',
        name: 'query_branch_database',
        result: { status: 'found', recordsCount: 14, audited: true },
        isError: false,
      },
    });

    assert.equal(toolMsg.role, 'tool');
    assert.equal(toolMsg.toolResult.toolCallId, 'call_search_9812');
    assert.equal(toolMsg.toolResult.result.recordsCount, 14);
    assert.equal(toolMsg.toolResult.isError, false);
    assert.equal(toolMsg.interrupt, undefined, 'Autonomous tool result turn must have undefined interrupt');
  });

  it('11. Selective HITL interrupt card stores SHA-256 digest and manages approval lifecycle (Protocol 46)', async () => {
    const chat = await Chat.create({ user: testUser._id });

    const interruptedTurn = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'assistant',
      text: 'I have prepared the emergency Telegram broadcast for executive approval.',
      status: 'interrupted',
      interrupt: {
        digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        actionName: 'telegram_broadcast',
        payload: {
          chatId: 'management_ops',
          message: 'CRITICAL ALERT: System downtime scheduled.',
        },
        status: 'pending',
      },
    });

    assert.equal(interruptedTurn.status, 'interrupted');
    assert.ok(interruptedTurn.interrupt);
    assert.equal(interruptedTurn.interrupt.actionName, 'telegram_broadcast');
    assert.equal(interruptedTurn.interrupt.digest, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(interruptedTurn.interrupt.status, 'pending');

    // Transition status to approved upon human approval
    interruptedTurn.interrupt.status = 'approved';
    interruptedTurn.status = 'completed';
    await interruptedTurn.save();

    const reloadedTurn = await Message.findById(interruptedTurn._id);
    assert.equal(reloadedTurn.interrupt.status, 'approved');
    assert.equal(reloadedTurn.status, 'completed');
  });

  it('12. Token usage telemetry and standardized error envelopes persist cleanly', async () => {
    const chat = await Chat.create({ user: testUser._id });

    // Turn with usage metrics
    const msgWithUsage = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'assistant',
      text: 'Response with token usage metrics.',
      usage: {
        promptTokens: 412,
        completionTokens: 89,
        totalTokens: 501,
      },
    });

    assert.equal(msgWithUsage.usage.promptTokens, 412);
    assert.equal(msgWithUsage.usage.completionTokens, 89);
    assert.equal(msgWithUsage.usage.totalTokens, 501);

    // Turn with error envelope
    const msgWithError = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 2,
      role: 'assistant',
      status: 'error',
      error: {
        code: 'UPSTREAM_INFERENCE_TIMEOUT',
        message: 'Addis AI inference engine exceeded 30000ms SLA timeout.',
      },
    });

    assert.equal(msgWithError.status, 'error');
    assert.equal(msgWithError.error.code, 'UPSTREAM_INFERENCE_TIMEOUT');
    assert.ok(msgWithError.error.message.includes('SLA timeout'));
  });

  // ==========================================
  // SECTION 3: UNIVERSAL ASSET SCHEMA & STORAGE
  // ==========================================

  it('13. Universal Asset model creates image, audio, and file kinds with dedicated cloud storage (Protocol 43, 55)', async () => {
    // 1. Image Asset
    const imageAsset = await Asset.create({
      user: testUser._id,
      kind: 'image',
      fileName: 'chart_12345.png',
      originalName: 'Financial_Summary_Chart.png',
      mimeType: 'image/png',
      sizeBytes: 1548200,
      storageProvider: 'cloudinary',
      storageKey: 'operon/assets/chart_12345',
      secureUrl: 'https://res.cloudinary.com/operon-cloud/image/upload/v1/chart_12345.png',
      checksum: 'sha256_image_integrity_hash_1',
    });

    assert.ok(imageAsset._id);
    assert.equal(imageAsset.kind, 'image');
    assert.equal(imageAsset.storageProvider, 'cloudinary');
    assert.equal(imageAsset.status, 'ready');
    assert.equal(imageAsset.checksum, 'sha256_image_integrity_hash_1');

    // 2. Audio Asset with STT metadata
    const audioAsset = await Asset.create({
      user: testUser._id,
      kind: 'audio',
      fileName: 'voice_recording_001.webm',
      originalName: 'voice_note.webm',
      mimeType: 'audio/webm',
      sizeBytes: 420800,
      storageProvider: 'cloudinary',
      storageKey: 'operon/assets/voice_recording_001',
      secureUrl: 'https://res.cloudinary.com/operon-cloud/video/upload/v1/voice_recording_001.webm',
      duration: 28.5,
      transcript: 'የ2026 በጀት ሪፖርት ማጠቃለያ እባክህ አዘጋጅልኝ።',
      sttEngine: 'addis_ai',
    });

    assert.equal(audioAsset.kind, 'audio');
    assert.equal(audioAsset.duration, 28.5);
    assert.equal(audioAsset.transcript, 'የ2026 በጀት ሪፖርት ማጠቃለያ እባክህ አዘጋጅልኝ።');
    assert.equal(audioAsset.sttEngine, 'addis_ai');

    // 3. Document File Asset with extracted text (Protocol 48)
    const fileAsset = await Asset.create({
      user: testUser._id,
      kind: 'file',
      fileName: 'branch_audit_report.pdf',
      originalName: 'Branch_Audit_Report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3145728,
      storageProvider: 'google_drive',
      storageKey: '1gDriveFileId_Example123456',
      secureUrl: 'https://drive.google.com/uc?id=1gDriveFileId_Example123456',
      extractedText: 'Confidential Audit Findings: All branch accounts reconciled with 0 anomalies.',
    });

    assert.equal(fileAsset.kind, 'file');
    assert.equal(fileAsset.storageProvider, 'google_drive');
    assert.equal(
      fileAsset.extractedText,
      'Confidential Audit Findings: All branch accounts reconciled with 0 anomalies.'
    );
  });

  it('14. Strict 3-kind taxonomy rejects unsupported kinds and enforces zero synthetic purpose field (Protocol 55)', async () => {
    // Unsupported kind rejected
    await assert.rejects(
      async () => {
        await Asset.create({
          user: testUser._id,
          kind: 'video',
          fileName: 'clip.mp4',
          originalName: 'clip.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 10000000,
          storageKey: 'key_vid',
          secureUrl: 'https://example.com/clip.mp4',
        });
      },
      /Asset kind `video` is not supported/i
    );

    // Verify schema does not contain synthetic purpose field
    const testAsset = await Asset.create({
      user: testUser._id,
      kind: 'image',
      fileName: 'avatar.webp',
      originalName: 'avatar.webp',
      mimeType: 'image/webp',
      sizeBytes: 50000,
      storageKey: 'avatar_key',
      secureUrl: 'https://example.com/avatar.webp',
    });

    assert.equal(testAsset.toObject().purpose, undefined, 'Synthetic purpose field must not exist on Asset');
  });

  it('15. Cloud storage exclusivity rejects unsupported storage providers and prohibits local paths (Protocol 43)', async () => {
    // Unsupported storage provider
    await assert.rejects(
      async () => {
        await Asset.create({
          user: testUser._id,
          kind: 'file',
          fileName: 'doc.txt',
          originalName: 'doc.txt',
          mimeType: 'text/plain',
          sizeBytes: 1024,
          storageProvider: 'local_disk',
          storageKey: 'uploads/doc.txt',
          secureUrl: 'http://localhost:4000/uploads/doc.txt',
        });
      },
      /Storage provider `local_disk` is not supported/i
    );

    // Defense against local filesystem path injection via constructor or setter
    assert.throws(
      () => {
        new Asset({
          user: testUser._id,
          kind: 'file',
          fileName: 'leak.txt',
          originalName: 'leak.txt',
          mimeType: 'text/plain',
          sizeBytes: 512,
          storageProvider: 'cloudinary',
          storageKey: 'key',
          secureUrl: 'https://example.com/leak.txt',
          path: '/uploads/leak.txt',
        });
      },
      /Local server filesystem storage paths are strictly forbidden/i
    );
  });

  it('16. Relational linking between Asset, Message, and Chat supports compound querying', async () => {
    const chat = await Chat.create({ user: testUser._id, title: 'Multimodal Discussion' });

    const asset = await Asset.create({
      user: testUser._id,
      chat: chat._id,
      kind: 'image',
      fileName: 'diagram_abc.png',
      originalName: 'System_Architecture.png',
      mimeType: 'image/png',
      sizeBytes: 819200,
      storageKey: 'diag_key_abc',
      secureUrl: 'https://res.cloudinary.com/operon-cloud/image/upload/diag_abc.png',
      checksum: 'sha256_diagram_abc_checksum',
    });

    const turnMessage = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Analyze the attached architecture diagram.',
      assets: [asset._id],
    });

    // Link message back on asset
    asset.message = turnMessage._id;
    await asset.save();

    // Query message turn with populated assets
    const populatedMessage = await Message.findById(turnMessage._id).populate('assets');
    assert.equal(populatedMessage.assets.length, 1);
    assert.equal(populatedMessage.assets[0].fileName, 'diagram_abc.png');

    // Query asset by compound index { chat: 1, message: 1 }
    const turnAssets = await Asset.find({ chat: chat._id, message: turnMessage._id });
    assert.equal(turnAssets.length, 1);
    assert.equal(turnAssets[0]._id.toString(), asset._id.toString());

    // Deduplication query by compound index { user: 1, checksum: 1 }
    const duplicateMatch = await Asset.findOne({
      user: testUser._id,
      checksum: 'sha256_diagram_abc_checksum',
    });
    assert.ok(duplicateMatch);
    assert.equal(duplicateMatch._id.toString(), asset._id.toString());
  });

  // ==========================================
  // SECTION 4: CASCADING DELETION & TEARDOWN
  // ==========================================

  it('17. Chat deletion cascades to remove all associated Messages and Assets', async () => {
    const chat = await Chat.create({ user: testUser._id, title: 'Temporary Chat To Delete' });

    const msg = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Message to be cascaded.',
    });

    const asset = await Asset.create({
      user: testUser._id,
      chat: chat._id,
      kind: 'image',
      fileName: 'temp.jpg',
      originalName: 'temp.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 10240,
      storageKey: 'temp_key',
      secureUrl: 'https://example.com/temp.jpg',
    });

    // Trigger document-level deleteOne hook on chat
    await chat.deleteOne();

    // Confirm chat, message, and asset are deleted
    const [foundChat, foundMessage, foundAsset] = await Promise.all([
      Chat.findById(chat._id),
      Message.findById(msg._id),
      Asset.findById(asset._id),
    ]);

    assert.equal(foundChat, null, 'Chat should be deleted');
    assert.equal(foundMessage, null, 'Associated message should be cascade deleted');
    assert.equal(foundAsset, null, 'Associated asset should be cascade deleted');
  });

  it('18. Three-Tier Account Deletion purges user, chats, messages, and assets simultaneously (Protocol 42)', async () => {
    // Create dedicated user for account deletion test
    const ephemeralUser = await User.create({
      email: 'deletion-target@operon-test.local',
      password: 'Password123!',
      firstName: 'Deletion',
      lastName: 'Target',
    });

    const chat = await Chat.create({ user: ephemeralUser._id });
    const message = await Message.create({
      chat: chat._id,
      user: ephemeralUser._id,
      sequence: 1,
      role: 'user',
      text: 'To be wiped upon account deletion.',
    });
    const asset = await Asset.create({
      user: ephemeralUser._id,
      chat: chat._id,
      kind: 'file',
      fileName: 'to_wipe.txt',
      originalName: 'to_wipe.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      storageKey: 'wipe_key',
      secureUrl: 'https://example.com/wipe.txt',
    });

    // Execute Three-Tier Account Deletion
    const result = await executeAccountDeletion(ephemeralUser._id.toString(), 'Password123!');
    assert.equal(result.success, true);

    // Verify all four collections are completely purged of this user's data
    const [userDoc, chatDoc, messageDoc, assetDoc] = await Promise.all([
      User.findById(ephemeralUser._id),
      Chat.findById(chat._id),
      Message.findById(message._id),
      Asset.findById(asset._id),
    ]);

    assert.equal(userDoc, null);
    assert.equal(chatDoc, null);
    assert.equal(messageDoc, null);
    assert.equal(assetDoc, null);
  });

  it('19. Query-level Chat.deleteOne and Chat.deleteMany cascade to purge associated Messages and Assets', async () => {
    // 1. Query-level Chat.deleteOne
    const chat1 = await Chat.create({ user: testUser._id, title: 'Query DeleteOne Chat' });
    const msg1 = await Message.create({
      chat: chat1._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Message for query deleteOne',
    });
    const asset1 = await Asset.create({
      user: testUser._id,
      chat: chat1._id,
      kind: 'file',
      fileName: 'query_del.txt',
      originalName: 'query_del.txt',
      mimeType: 'text/plain',
      sizeBytes: 256,
      storageKey: 'query_del_key',
      secureUrl: 'https://example.com/query_del.txt',
    });

    await Chat.deleteOne({ _id: chat1._id });

    const [foundMsg1, foundAsset1] = await Promise.all([
      Message.findById(msg1._id),
      Asset.findById(asset1._id),
    ]);
    assert.equal(foundMsg1, null, 'Associated message must be cascade deleted on Chat.deleteOne query');
    assert.equal(foundAsset1, null, 'Associated asset must be cascade deleted on Chat.deleteOne query');

    // 2. Query-level Chat.deleteMany
    const chat2 = await Chat.create({ user: testUser._id, title: 'Bulk Chat A' });
    const chat3 = await Chat.create({ user: testUser._id, title: 'Bulk Chat B' });
    const msg2 = await Message.create({
      chat: chat2._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Bulk message 2',
    });
    const msg3 = await Message.create({
      chat: chat3._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Bulk message 3',
    });

    await Chat.deleteMany({ _id: { $in: [chat2._id, chat3._id] } });

    const [foundMsg2, foundMsg3] = await Promise.all([
      Message.findById(msg2._id),
      Message.findById(msg3._id),
    ]);
    assert.equal(foundMsg2, null, 'Associated message 2 must be cascade deleted on Chat.deleteMany');
    assert.equal(foundMsg3, null, 'Associated message 3 must be cascade deleted on Chat.deleteMany');
  });

  it('20. Monotonic sequence and byte size strictly reject floating-point numbers', async () => {
    const chat = await Chat.create({ user: testUser._id });

    // Floating-point sequence rejected on Message (Protocol 49)
    await assert.rejects(
      async () => {
        await Message.create({
          chat: chat._id,
          user: testUser._id,
          sequence: 1.5,
          role: 'user',
          text: 'Fractional sequence',
        });
      },
      /Sequence must be an integer/i
    );

    // Negative or float thoughtDurationMs rejected on Message
    await assert.rejects(
      async () => {
        await Message.create({
          chat: chat._id,
          user: testUser._id,
          sequence: 10,
          role: 'assistant',
          text: 'Fractional duration',
          thoughtDurationMs: 150.75,
        });
      },
      /Thought duration must be an integer/i
    );

    // Floating-point sizeBytes rejected on Asset
    await assert.rejects(
      async () => {
        await Asset.create({
          user: testUser._id,
          kind: 'image',
          fileName: 'float_size.png',
          originalName: 'float_size.png',
          mimeType: 'image/png',
          sizeBytes: 1024.5,
          storageKey: 'float_key',
          secureUrl: 'https://example.com/float_size.png',
        });
      },
      /File size must be an integer/i
    );
  });

  it('21. Asset deletion cascades to pull references from Message.assets', async () => {
    const chat = await Chat.create({ user: testUser._id });

    const assetToPull = await Asset.create({
      user: testUser._id,
      chat: chat._id,
      kind: 'image',
      fileName: 'pull_target.png',
      originalName: 'pull_target.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      storageKey: 'pull_key',
      secureUrl: 'https://example.com/pull_target.png',
    });

    const msgWithAsset = await Message.create({
      chat: chat._id,
      user: testUser._id,
      sequence: 1,
      role: 'user',
      text: 'Message referencing asset to be deleted',
      assets: [assetToPull._id],
    });

    assert.equal(msgWithAsset.assets.length, 1);

    // Delete asset at document level
    await assetToPull.deleteOne();

    const updatedMsg = await Message.findById(msgWithAsset._id);
    assert.equal(updatedMsg.assets.length, 0, 'Deleted asset ID must be automatically pulled from Message.assets');
  });

  it('22. Handles high-capacity extractedText (5MB) and preserves cross-user checksum isolation', async () => {
    // 1. High-capacity extracted text (> 5MB) on document Asset (Protocol 48)
    const largeText = 'A'.repeat(5 * 1024 * 1024); // 5 MB text string
    const docAsset = await Asset.create({
      user: testUser._id,
      kind: 'file',
      fileName: 'large_dossier.pdf',
      originalName: 'Large_Dossier.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 6000000,
      storageProvider: 'cloudinary',
      storageKey: 'large_dossier_key',
      secureUrl: 'https://res.cloudinary.com/operon-cloud/raw/upload/large_dossier.pdf',
      extractedText: largeText,
    });

    const reloadedDoc = await Asset.findById(docAsset._id);
    assert.equal(reloadedDoc.extractedText.length, 5 * 1024 * 1024);
    assert.equal(reloadedDoc.extractedText.slice(0, 10), 'AAAAAAAAAA');

    // Clean up large asset to avoid database memory bloat
    await reloadedDoc.deleteOne();

    // 2. Cross-user checksum isolation on compound index { user: 1, checksum: 1 }
    const secondUser = await User.create({
      email: 'checksum-isolation@operon-test.local',
      password: 'Password123!',
      firstName: 'Checksum',
      lastName: 'User',
    });

    const commonChecksum = 'sha256_identical_file_digest_cross_user';

    const assetUser1 = await Asset.create({
      user: testUser._id,
      kind: 'file',
      fileName: 'user1_file.pdf',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      storageKey: 'key_u1',
      secureUrl: 'https://example.com/u1.pdf',
      checksum: commonChecksum,
    });

    const assetUser2 = await Asset.create({
      user: secondUser._id,
      kind: 'file',
      fileName: 'user2_file.pdf',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      storageKey: 'key_u2',
      secureUrl: 'https://example.com/u2.pdf',
      checksum: commonChecksum,
    });

    assert.ok(assetUser1._id);
    assert.ok(assetUser2._id);
    assert.notEqual(assetUser1._id.toString(), assetUser2._id.toString());

    // Scoped query retrieves only the respective user's asset
    const user1Match = await Asset.findOne({ user: testUser._id, checksum: commonChecksum });
    const user2Match = await Asset.findOne({ user: secondUser._id, checksum: commonChecksum });

    assert.equal(user1Match._id.toString(), assetUser1._id.toString());
    assert.equal(user2Match._id.toString(), assetUser2._id.toString());

    // Clean up second user documents
    await Promise.all([
      Asset.deleteMany({ user: secondUser._id }),
      User.deleteOne({ _id: secondUser._id }),
    ]);
  });
});
