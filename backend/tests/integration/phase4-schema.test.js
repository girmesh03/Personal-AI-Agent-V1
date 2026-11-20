/**
 * @module tests/integration/phase4-schema.test
 * @description Headless automated integration test suite for Phase 4 Operational Domain Architecture —
 * Branch & Report Schema Design.
 * Validates Branch model (flattened geography, uppercase codes, bilingual aliases, collation uniqueness, pagination),
 * Report model (dual-calendar temporal grounding, shift hours, bounded shift items, universal multimodal assets, pagination),
 * historical report preservation upon branch deletion, Three-Tier Account Deletion cascading,
 * and guaranteed database teardown hygiene.
 * Strictly adheres to Protocol 20 & 36 (comprehensive JSDoc), Protocol 21 (user isolation),
 * Protocol 42 (three-tier account deletion), Protocol 43 (cloud media storage exclusivity),
 * Protocol 48 (text extraction), Protocol 54 (dual-calendar temporal authority),
 * Protocol 55 (pristine multimodal asset preservation), Protocol 65 (universal user terminology),
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
  Branch,
  Report,
} from './testHarness.js';
import {
  BRANCH_CONSTANTS,
  REPORT_CONSTANTS,
  ASSET_CONSTANTS,
} from '../../src/utils/constants.js';
import { toEthiopianDateString } from '../../src/utils/ethiopianCalendar.js';
import { executeAccountDeletion } from '../../src/services/userService.js';

describe('Phase 4 Branch & Report Schema Automated Integration Test Suite', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {() => Promise<void>} */
  let stopServer;
  /** @type {TestClient} */
  let client;

  /** @type {import('mongoose').Document} */
  let testUser;
  /** @type {import('mongoose').Document} */
  let crossUser;

  const primaryCredentials = {
    email: 'phase4-lead@operon-test.local',
    password: 'Password123!',
    firstName: 'PhaseFour',
    lastName: 'Lead',
  };

  const crossCredentials = {
    email: 'phase4-cross@operon-test.local',
    password: 'Password123!',
    firstName: 'Cross',
    lastName: 'Tenant',
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

    // 4. Create primary and cross-tenant test users for isolation tests
    testUser = await User.create(primaryCredentials);
    crossUser = await User.create(crossCredentials);

    // Ensure database indexes are created
    await Branch.createIndexes();
    await Report.createIndexes();
  });

  after(async () => {
    try {
      // 1. Explicitly purge testUser scoped documents
      if (testUser?._id || crossUser?._id) {
        const userIds = [testUser?._id, crossUser?._id].filter(Boolean);
        await Promise.all([
          Report.deleteMany({ user: { $in: userIds } }),
          Branch.deleteMany({ user: { $in: userIds } }),
          Asset.deleteMany({ user: { $in: userIds } }),
          Message.deleteMany({ user: { $in: userIds } }),
          Chat.deleteMany({ user: { $in: userIds } }),
          User.deleteMany({ _id: { $in: userIds } }),
        ]);
      }

      // 2. Guaranteed post-test database purge inside try/finally (Protocol 68)
      await purgeTestUsers();

      // Exhaustive teardown verification across all 6 collections
      const [
        remainingUsers,
        remainingBranches,
        remainingReports,
        remainingAssets,
        remainingMessages,
        remainingChats,
      ] = await Promise.all([
        User.countDocuments({ email: TEST_EMAIL_DOMAIN_REGEX }),
        Branch.countDocuments({ user: { $in: [testUser?._id, crossUser?._id].filter(Boolean) } }),
        Report.countDocuments({ user: { $in: [testUser?._id, crossUser?._id].filter(Boolean) } }),
        Asset.countDocuments({ user: { $in: [testUser?._id, crossUser?._id].filter(Boolean) } }),
        Message.countDocuments({ user: { $in: [testUser?._id, crossUser?._id].filter(Boolean) } }),
        Chat.countDocuments({ user: { $in: [testUser?._id, crossUser?._id].filter(Boolean) } }),
      ]);

      assert.equal(remainingUsers, 0, 'Teardown hygiene failed: residual test users found in database');
      assert.equal(remainingBranches, 0, 'Teardown hygiene failed: residual test branches found in database');
      assert.equal(remainingReports, 0, 'Teardown hygiene failed: residual test reports found in database');
      assert.equal(remainingAssets, 0, 'Teardown hygiene failed: residual test assets found in database');
      assert.equal(remainingMessages, 0, 'Teardown hygiene failed: residual test messages found in database');
      assert.equal(remainingChats, 0, 'Teardown hygiene failed: residual test chats found in database');
    } finally {
      if (stopServer) {
        await stopServer();
      }
      await disconnectDB();
    }
  });

  // =========================================================================
  // SECTION 1: BRANCH MODEL SPECIFICATION & INVARIANTS
  // =========================================================================

  describe('1. Branch Model Specification & Invariants', () => {
    it('1.1 should create an active Branch with flattened geography and uppercase code', async () => {
      const branch = await Branch.create({
        user: testUser._id,
        name: 'Bole Medhanialem',
        code: 'bole-01',
        aliases: ['Bole', 'ቦሌ መድኃኒዓለም'],
        city: 'Addis Ababa',
        subcity: 'Bole',
        address: 'Cameroon St, near Medhanialem Church',
        managerName: 'Abebe Bikila',
        contactPhone: '+251911000001',
      });

      assert.ok(branch._id, 'Branch should have an _id');
      assert.equal(branch.name, 'Bole Medhanialem');
      assert.equal(branch.code, 'BOLE-01', 'Branch code should be auto-uppercased');
      assert.equal(branch.city, 'Addis Ababa', 'City should be flattened at top-level');
      assert.equal(branch.subcity, 'Bole', 'Subcity should be flattened at top-level');
      assert.equal(branch.address, 'Cameroon St, near Medhanialem Church', 'Address should be flattened at top-level');
      assert.equal(branch.isArchived, false, 'Branch should default to active');
      assert.equal(branch.archivedAt, null, 'archivedAt should default to null');
      assert.equal(branch.location, undefined, 'location subdocument must not exist per Directive 5');
      assert.equal(branch.aliases.length, 2);
    });

    it('1.2 should apply default city if not explicitly provided', async () => {
      const branch = await Branch.create({
        user: testUser._id,
        name: 'Kazanchis Total',
        code: 'KAZ-01',
      });

      assert.equal(branch.city, BRANCH_CONSTANTS.DEFAULT_CITY, 'City should default to Addis Ababa');
      assert.equal(branch.subcity, '', 'Subcity should default to empty string');
      assert.equal(branch.address, '', 'Address should default to empty string');
    });

    it('1.3 should enforce active name uniqueness with case-insensitive collation', async () => {
      await assert.rejects(
        async () => {
          await Branch.create({
            user: testUser._id,
            name: 'bole medhanialem', // Same name in lowercase
            code: 'BOLE-02',
          });
        },
        (err) => {
          assert.equal(err.code, 11000, 'Duplicate key error code 11000 expected');
          return true;
        },
        'Should reject duplicate branch name with case-insensitive collation'
      );
    });

    it('1.4 should isolate branch names per user (cross-tenant name coexistence)', async () => {
      const crossBranch = await Branch.create({
        user: crossUser._id,
        name: 'Bole Medhanialem', // Same name as testUser's branch
        code: 'BOLE-CROSS',
      });

      assert.ok(crossBranch._id, 'Different user should be able to create branch with same name');
      assert.equal(crossBranch.name, 'Bole Medhanialem');
    });

    it('1.5 should enforce active operational code uniqueness per user', async () => {
      await assert.rejects(
        async () => {
          await Branch.create({
            user: testUser._id,
            name: 'Bole Atlas',
            code: 'BOLE-01', // Already used by testUser
          });
        },
        (err) => {
          assert.equal(err.code, 11000, 'Duplicate key error code 11000 expected');
          return true;
        },
        'Should reject duplicate operational code for the same user'
      );
    });

    it('1.6 should allow soft-archival and permit reusing name/code for a new active branch', async () => {
      const branchToArchive = await Branch.create({
        user: testUser._id,
        name: 'Sarbet Old',
        code: 'SAR-01',
      });

      // Soft-archive the branch
      branchToArchive.isArchived = true;
      branchToArchive.archivedAt = new Date();
      await branchToArchive.save();

      // Now create a new active branch with the same name and code
      const newActiveBranch = await Branch.create({
        user: testUser._id,
        name: 'Sarbet Old',
        code: 'SAR-01',
      });

      assert.ok(newActiveBranch._id, 'Should create new active branch with same name/code as archived branch');
      assert.equal(newActiveBranch.isArchived, false);
    });

    it('1.7 should paginate branches using mongoose-paginate-v2 plugin', async () => {
      const result = await Branch.paginate(
        { user: testUser._id, isArchived: false },
        { page: 1, limit: 2, sort: { createdAt: -1 } }
      );

      assert.ok(Array.isArray(result.docs), 'paginate result should contain docs array');
      assert.equal(result.page, 1);
      assert.equal(result.limit, 2);
      assert.ok(result.totalDocs >= 3, `Expected at least 3 totalDocs, got ${result.totalDocs}`);
      assert.ok(result.totalPages >= 2);
    });

    it('1.8 should trim whitespace on individual alias strings', async () => {
      const branchWithUntrimmedAliases = await Branch.create({
        user: testUser._id,
        name: 'Gerji Imperial',
        code: 'GER-01',
        aliases: ['  Gerji  ', '  ገርጂ  '],
      });

      assert.equal(branchWithUntrimmedAliases.aliases[0], 'Gerji', 'First alias should be trimmed');
      assert.equal(branchWithUntrimmedAliases.aliases[1], 'ገርጂ', 'Second alias should be trimmed');
    });
  });

  // =========================================================================
  // SECTION 2: REPORT MODEL & DUAL-CALENDAR TEMPORAL GROUNDING
  // =========================================================================

  describe('2. Report Model & Dual-Calendar Temporal Grounding', () => {
    it('2.1 should auto-populate dateString and ethiopianDate in pre-validate hook', async () => {
      const inspectionDate = new Date('2026-11-20T10:00:00.000Z');
      const expectedDateString = '2026-11-20';
      const expectedEthiopianDate = toEthiopianDateString(inspectionDate);

      // Verify ethiopianDate calculation
      assert.equal(expectedEthiopianDate, '11-03-19', 'Nov 20, 2026 UTC should convert to 11-03-19');

      const report = await Report.create({
        user: testUser._id,
        date: inspectionDate,
        clockIn: '08:00',
        clockOut: '17:30',
        transcription: 'የዛሬው የቦሌ እና ካዛንቺስ ቅርንጫፎች ዕለታዊ የቁጥጥር ሪፖርት ሙሉ ዝርዝር።',
      });

      assert.ok(report._id, 'Report should be saved');
      assert.equal(report.dateString, expectedDateString, 'dateString should be auto-derived');
      assert.equal(report.ethiopianDate, expectedEthiopianDate, 'ethiopianDate should be auto-derived');
      assert.equal(report.isArchived, false);
      assert.equal(report.archivedAt, null);
    });

    it('2.2 should enforce partial compound unique index on dateString per user', async () => {
      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-20T14:00:00.000Z'), // Same Gregorian calendar date (2026-11-20)
            clockIn: '09:00',
            clockOut: '18:00',
            transcription: 'ተደጋጋሚ የሪፖርት ሙከራ።',
          });
        },
        (err) => {
          assert.equal(err.code, 11000, 'Duplicate key error code 11000 expected on dateString');
          return true;
        },
        'Should reject second active report on the same Gregorian calendar date'
      );
    });

    it('2.3 should isolate report dates per user (cross-tenant date coexistence)', async () => {
      const crossReport = await Report.create({
        user: crossUser._id,
        date: new Date('2026-11-20T08:00:00.000Z'),
        clockIn: '08:30',
        clockOut: '17:00',
        transcription: 'የሌላ ተጠቃሚ ሪፖርት በተመሳሳይ ቀን።',
      });

      assert.ok(crossReport._id, 'Different user should be able to create report on same date');
      assert.equal(crossReport.dateString, '2026-11-20');
      assert.equal(crossReport.ethiopianDate, '11-03-19');
    });

    it('2.4 should validate shift work hours format against HH:mm regex', async () => {
      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-21T08:00:00.000Z'),
            clockIn: '25:00', // Invalid hour
            clockOut: '17:00',
            transcription: 'የስራ ሰዓት ቅርጸት ስህተት ሙከራ።',
          });
        },
        (err) => {
          assert.ok(err.errors?.clockIn, 'clockIn validation error expected');
          return true;
        },
        'Should reject invalid clockIn time format'
      );

      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-21T08:00:00.000Z'),
            clockIn: '08:00',
            clockOut: '17:65', // Invalid minute
            transcription: 'የስራ ሰዓት ቅርጸት ስህተት ሙከራ።',
          });
        },
        (err) => {
          assert.ok(err.errors?.clockOut, 'clockOut validation error expected');
          return true;
        },
        'Should reject invalid clockOut time format'
      );
    });

    it('2.5 should enforce partial compound unique index on ethiopianDate per user', async () => {
      // testUser already has an active report on 2026-11-20 with ethiopianDate '11-03-19'
      // Attempting to create another report with a distinct dateString but duplicate ethiopianDate
      // must trigger the partial compound unique index on { user: 1, ethiopianDate: 1 }
      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-12-05T08:00:00.000Z'),
            dateString: '2026-12-05', // Distinct dateString
            ethiopianDate: '11-03-19', // Duplicate Ethiopian date from 2026-11-20
            clockIn: '08:00',
            clockOut: '17:00',
            transcription: 'ተደጋጋሚ የኢትዮጵያ ቀን ሙከራ።',
          });
        },
        (err) => {
          assert.equal(err.code, 11000, 'Duplicate key error code 11000 expected on ethiopianDate');
          assert.ok(
            err.keyPattern?.ethiopianDate || err.message.includes('ethiopianDate'),
            'Index error should specifically identify ethiopianDate'
          );
          return true;
        },
        'Should reject duplicate report on the same Ethiopian calendar date'
      );
    });

    it('2.6 should update dateString and ethiopianDate when date is modified on an existing report', async () => {
      const dynamicReport = await Report.create({
        user: testUser._id,
        date: new Date('2026-12-10T10:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'ቀን የሚቀየርበት ሪፖርት።',
      });

      assert.equal(dynamicReport.dateString, '2026-12-10');
      assert.equal(dynamicReport.ethiopianDate, '01-04-19');

      // Mutate date to a new calendar day
      dynamicReport.date = new Date('2026-12-11T10:00:00.000Z');
      await dynamicReport.save();

      assert.equal(dynamicReport.dateString, '2026-12-11', 'dateString should be automatically updated');
      assert.equal(dynamicReport.ethiopianDate, '02-04-19', 'ethiopianDate should be automatically updated');
    });

    it('2.7 should accurately compute ethiopianDate from ISO timestamps with non-UTC timezone offsets', async () => {
      // 2026-11-19T23:00:00-05:00 is in UTC 2026-11-20T04:00:00.000Z (Hidar 11, 2019)
      const ethDate = toEthiopianDateString('2026-11-19T23:00:00-05:00');
      assert.equal(ethDate, '11-03-19', 'Timezone offset should normalize to UTC day');
    });
  });

  // =========================================================================
  // SECTION 3: BOUNDED SHIFT ITEMS (DIRECTIVE 5 SUBDOCUMENT MINIMIZATION)
  // =========================================================================

  describe('3. Bounded Shift Items (Directive 5)', () => {
    it('3.1 should embed visits, activities, issues, and comments with _id: false', async () => {
      const branch = await Branch.findOne({ user: testUser._id, code: 'BOLE-01' });
      assert.ok(branch, 'Branch BOLE-01 should exist');

      const report = await Report.create({
        user: testUser._id,
        date: new Date('2026-11-22T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'የሙሉ ቀን ዝርዝር የስራ ሪፖርት።',
        visits: [
          {
            branch: branch._id,
            clockIn: '09:00',
            clockOut: '12:00',
          },
        ],
        activities: [
          {
            text: 'የወጥ ቤት ንጽህና ቁጥጥር ተከናውኗል።',
            status: 'completed',
          },
          {
            text: 'የዕቃ ክምችት ቆጠራ።',
            status: 'in_progress',
          },
        ],
        issues: [
          {
            text: 'የመጥበሻ ማሽን የሙቀት መቆጣጠሪያ ተበላሽቷል።',
            status: 'reported',
          },
        ],
        comments: [
          {
            text: 'የሰራተኞች የስራ ተነሳሽነት በጣም ጥሩ ነበር።',
          },
        ],
      });

      assert.ok(report._id);
      assert.equal(report.visits.length, 1);
      assert.equal(report.visits[0]._id, undefined, 'Visits must not have subdocument _id');
      assert.equal(String(report.visits[0].branch), String(branch._id));
      assert.equal(report.visits[0].clockIn, '09:00');

      assert.equal(report.activities.length, 2);
      assert.equal(report.activities[0]._id, undefined, 'Activities must not have subdocument _id');
      assert.equal(report.activities[0].status, 'completed');

      assert.equal(report.issues.length, 1);
      assert.equal(report.issues[0]._id, undefined, 'Issues must not have subdocument _id');
      assert.equal(report.issues[0].status, 'reported');

      assert.equal(report.comments.length, 1);
      assert.equal(report.comments[0]._id, undefined, 'Comments must not have subdocument _id');
      assert.equal(report.comments[0].status, undefined, 'Comments must not have dead status field per Directive 4');
    });

    it('3.2 should validate activity and issue enum statuses', async () => {
      const branch = await Branch.findOne({ user: testUser._id, code: 'BOLE-01' });

      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-23T08:00:00.000Z'),
            clockIn: '08:00',
            clockOut: '17:00',
            transcription: 'የስታተስ ስህተት ሙከራ።',
            activities: [
              {
                text: 'ልክ ያልሆነ ስታተስ',
                status: 'invalid_status_value',
              },
            ],
          });
        },
        (err) => {
          assert.ok(err.errors?.['activities.0.status'], 'Activity status validation error expected');
          return true;
        },
        'Should reject invalid activity status enum'
      );

      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-23T08:00:00.000Z'),
            clockIn: '08:00',
            clockOut: '17:00',
            transcription: 'የስታተስ ስህተት ሙከራ።',
            issues: [
              {
                text: 'ልክ ያልሆነ የአይሹ ስታተስ',
                status: 'urgent', // Urgent is not in REPORT_CONSTANTS.ISSUE_STATUSES
              },
            ],
          });
        },
        (err) => {
          assert.ok(err.errors?.['issues.0.status'], 'Issue status validation error expected');
          return true;
        },
        'Should reject invalid issue status enum'
      );
    });
  });

  // =========================================================================
  // SECTION 4: UNIVERSAL MULTIMODAL ASSET ATTACHMENTS (DIRECTIVE 3)
  // =========================================================================

  describe('4. Universal Multimodal Asset Attachments (Directive 3)', () => {
    /** @type {import('mongoose').Document} */
    let fileAsset;
    /** @type {import('mongoose').Document} */
    let imageAsset;
    /** @type {import('mongoose').Document} */
    let audioAsset;

    before(async () => {
      // Create universal evidentiary assets across all 3 kinds (Protocol 55)
      fileAsset = await Asset.create({
        user: testUser._id,
        kind: 'file',
        fileName: 'kitchen-checklist.pdf',
        originalName: 'Kitchen_Checklist_Nov24.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024 * 50,
        storageProvider: 'cloudinary',
        storageKey: 'operon/reports/files/checklist-01',
        secureUrl: 'https://res.cloudinary.com/operon/raw/upload/checklist-01.pdf',
        extractedText: 'Kitchen inspection completed with 98% hygiene compliance score.',
      });

      imageAsset = await Asset.create({
        user: testUser._id,
        kind: 'image',
        fileName: 'fryer-heating-element.jpg',
        originalName: 'fryer_defect.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024 * 500,
        storageProvider: 'cloudinary',
        storageKey: 'operon/reports/images/fryer-01',
        secureUrl: 'https://res.cloudinary.com/operon/image/upload/fryer-01.jpg',
      });

      audioAsset = await Asset.create({
        user: testUser._id,
        kind: 'audio',
        fileName: 'shift-narration.mp3',
        originalName: 'Bole_Shift_Memo.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 1024 * 800,
        storageProvider: 'cloudinary',
        storageKey: 'operon/reports/audios/shift-01',
        secureUrl: 'https://res.cloudinary.com/operon/video/upload/shift-01.mp3',
        duration: 185.5,
        transcript: 'የቦሌ ቅርንጫፍ የጥዋት ፈረቃ ሰራተኞች ሙሉ በሙሉ በሰዓቱ ተገኝተዋል።',
        sttEngine: 'addis_ai',
      });
    });

    it('4.1 should link file, image, and audio assets to a Report without skipping', async () => {
      const report = await Report.create({
        user: testUser._id,
        date: new Date('2026-11-24T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'የመልቲሞዳል ማስረጃዎች የተያያዙበት የዕለቱ ሪፖርት።',
        assets: [fileAsset._id, imageAsset._id, audioAsset._id],
      });

      assert.ok(report._id);
      assert.equal(report.assets.length, 3);
      assert.ok(report.assets.map(String).includes(String(fileAsset._id)));
      assert.ok(report.assets.map(String).includes(String(imageAsset._id)));
      assert.ok(report.assets.map(String).includes(String(audioAsset._id)));
    });

    it('4.2 should populate linked assets and preserve multimodal metadata', async () => {
      const populatedReport = await Report.findOne({
        user: testUser._id,
        dateString: '2026-11-24',
      }).populate('assets');

      assert.ok(populatedReport);
      assert.equal(populatedReport.assets.length, 3);

      const kinds = populatedReport.assets.map((a) => a.kind);
      assert.ok(kinds.includes('file'));
      assert.ok(kinds.includes('image'));
      assert.ok(kinds.includes('audio'));

      const audio = populatedReport.assets.find((a) => a.kind === 'audio');
      assert.equal(audio.sttEngine, 'addis_ai');
      assert.ok(audio.transcript.includes('የቦሌ ቅርንጫፍ'));

      const file = populatedReport.assets.find((a) => a.kind === 'file');
      assert.ok(file.extractedText.includes('98% hygiene compliance'));
    });

    it('4.3 should query reports containing specific evidentiary asset IDs', async () => {
      const matchedReports = await Report.find({
        user: testUser._id,
        assets: imageAsset._id,
      });

      assert.equal(matchedReports.length, 1);
      assert.equal(matchedReports[0].dateString, '2026-11-24');
    });

    it('4.4 should enforce REPORT_CONSTANTS.MAX_ASSETS ceiling', async () => {
      const dummyAssetIds = Array.from({ length: 21 }, () => new mongoose.Types.ObjectId());

      await assert.rejects(
        async () => {
          await Report.create({
            user: testUser._id,
            date: new Date('2026-11-25T08:00:00.000Z'),
            clockIn: '08:00',
            clockOut: '17:00',
            transcription: 'የከፍተኛ መጠን አሴቶች ሙከራ።',
            assets: dummyAssetIds,
          });
        },
        (err) => {
          assert.ok(err.errors?.assets, 'Asset array length ceiling validation error expected');
          return true;
        },
        'Should reject report exceeding maximum asset ceiling'
      );
    });

    it('4.5 should clean up asset reference from Report.assets when Asset is deleted', async () => {
      // Create a temporary asset and link it to a report
      const tempAsset = await Asset.create({
        user: testUser._id,
        kind: 'image',
        fileName: 'temp-inspection.jpg',
        originalName: 'temp.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        storageProvider: 'cloudinary',
        storageKey: 'operon/temp/img1',
        secureUrl: 'https://res.cloudinary.com/operon/image/upload/temp.jpg',
      });

      const report = await Report.create({
        user: testUser._id,
        date: new Date('2026-11-26T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'ጊዜያዊ ምስል የተያያዘበት ሪፖርት።',
        assets: [tempAsset._id],
      });

      assert.equal(report.assets.length, 1);

      // Delete the asset document
      await Asset.deleteOne({ _id: tempAsset._id });

      // Verify the reference is pulled from the report
      const updatedReport = await Report.findById(report._id);
      assert.equal(updatedReport.assets.length, 0, 'Deleted asset ID should be pulled from Report.assets');
    });

    it('4.6 should handle null or empty assets array without throwing TypeError', async () => {
      const reportWithoutAssets = new Report({
        user: testUser._id,
        date: new Date('2026-12-01T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'አሴት የሌለው ሪፖርት።',
      });
      reportWithoutAssets.assets = null;
      await reportWithoutAssets.validate();
      assert.ok(true, 'Validation should succeed without TypeError when assets is null');
    });
  });

  // =========================================================================
  // SECTION 5: HISTORICAL PRESERVATION, CASCADING & DELETION HYGIENE
  // =========================================================================

  describe('5. Historical Data Integrity & Cascading Safety', () => {
    it('5.1 should NOT delete historical reports when an archived branch is deleted', async () => {
      // Create a branch specifically to inspect, archive, and then permanently delete (historical sweeper scenario)
      const temporaryBranch = await Branch.create({
        user: testUser._id,
        name: 'Temporary Branch for Audit',
        code: 'TEMP-AUDIT',
      });

      // Create a report that visited this temporary branch
      const auditReport = await Report.create({
        user: testUser._id,
        date: new Date('2026-11-27T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'የታሪካዊ ጥበቃ ማረጋገጫ ሪፖርት።',
        visits: [
          {
            branch: temporaryBranch._id,
            clockIn: '10:00',
            clockOut: '12:00',
          },
        ],
      });

      assert.ok(auditReport._id);

      // Soft-archive the temporary branch first (reproducing V0 archived sweeper scenario)
      temporaryBranch.isArchived = true;
      temporaryBranch.archivedAt = new Date();
      await temporaryBranch.save();

      // Permanently delete the archived temporary branch
      await Branch.deleteOne({ _id: temporaryBranch._id });

      // Verify the historical report is PRESERVED (eradicating V0 sweeper cascade bug!)
      const preservedReport = await Report.findById(auditReport._id);
      assert.ok(preservedReport, 'Historical report must NOT be deleted when an archived branch is deleted');
      assert.equal(preservedReport.visits.length, 1);
      assert.equal(String(preservedReport.visits[0].branch), String(temporaryBranch._id));
    });

    it('5.2 should paginate reports using mongoose-paginate-v2 plugin', async () => {
      const result = await Report.paginate(
        { user: testUser._id, isArchived: false },
        { page: 1, limit: 3, sort: { date: -1 } }
      );

      assert.ok(Array.isArray(result.docs), 'paginate result should contain docs array');
      assert.equal(result.page, 1);
      assert.equal(result.limit, 3);
      assert.ok(result.totalDocs >= 4, `Expected at least 4 totalDocs, got ${result.totalDocs}`);
      assert.ok(result.totalPages >= 2);
    });

    it('5.3 should cascade purge Branches and Reports during Three-Tier Account Deletion', async () => {
      // Create a disposable user with branches, reports, chats, messages, and assets
      const disposableUser = await User.create({
        email: 'phase4-disposable@operon-test.local',
        password: 'Password123!',
        firstName: 'Disposable',
        lastName: 'User',
      });

      const branch = await Branch.create({
        user: disposableUser._id,
        name: 'Disposable Branch',
        code: 'DISP-01',
      });

      const report = await Report.create({
        user: disposableUser._id,
        date: new Date('2026-11-28T08:00:00.000Z'),
        clockIn: '08:00',
        clockOut: '17:00',
        transcription: 'የሚሰረዝ ተጠቃሚ ሪፖርት።',
        visits: [{ branch: branch._id, clockIn: '08:30', clockOut: '10:30' }],
      });

      // Verify documents exist before deletion
      assert.ok(await Branch.findById(branch._id));
      assert.ok(await Report.findById(report._id));

      // Execute Three-Tier Account Deletion (Protocol 42)
      const deletionResult = await executeAccountDeletion(String(disposableUser._id), 'Password123!');
      assert.equal(deletionResult.success, true);

      // Verify Tier 1 purge cascaded to Branch and Report
      const [remainingUser, remainingBranch, remainingReport] = await Promise.all([
        User.findById(disposableUser._id),
        Branch.findById(branch._id),
        Report.findById(report._id),
      ]);

      assert.equal(remainingUser, null, 'User should be purged');
      assert.equal(remainingBranch, null, 'Branch should be cascaded and purged in Tier 1');
      assert.equal(remainingReport, null, 'Report should be cascaded and purged in Tier 1');
    });
  });
});
