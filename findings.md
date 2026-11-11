# Findings & Discoveries: Phase 1 — Full-Stack Foundation and Engineering Quality System

> **Product:** Operon (Personal AI Agent V1)  
> **Environment:** Antigravity 2.0  
> **Target Branch:** `phase-1-fullstack-foundation`  

## Codebase Audit Baseline Findings

### 1. Repository Structure & Root State
- Root `package.json` defines npm workspaces: `["backend", "client"]`.
- `backend/` and `client/` have separate manifests, lockfiles, and node_modules. This satisfies the architectural invariant preserving isolated application boundaries.
- Root scripts orchestrate commands using workspaces (`dev`, `dev:backend`, `dev:client`, `verify`, `kill-ports`).

### 2. Backend Inspection & Environment Hardening
- `backend/.env` contains verified connection string to MongoDB Atlas replica set (`atlas-6frzxd-shard-0`) on database `operon-v1`.
- Direct cross-continental TCP latency to `ap-southeast-2` (Australia) requires initial connection server selection timeout of 30,000ms (`serverSelectionTimeoutMS: 30000` in `db.js`) to guarantee handshake resilience across all 3 replica set members (`shard-00-00`, `shard-00-01`, `shard-00-02`). Tested and verified live with successful handshake.
- Strict adherence to `docs/*` enforced: eliminated unapproved variables (`COOKIE_SECRET`, `MONGO_SERVER_SELECTION_TIMEOUT`) from code and configuration.

### 3. Server Entry Point & Process Lifecycle
- `backend/src/server.js` is the standalone process entry point. It exports named lifecycle functions (`startServer`, `gracefulShutdown`) and auto-starts when run directly. Redundant `export default` was removed as nothing consumes it.

### 4. Logging & DevDependencies Boundary
- Core runtime application code (`src/*`) must never import from `devDependencies`.
- `morgan` was located in `devDependencies` while being imported in `app.js`. Removed `morgan` entirely; HTTP request logging is now handled directly by our Winston logger middleware (`logger.http`).
- Obsolete `logStream` adapter removed from `backend/src/config/logger.js`.
- Authoritative database connection logging: removed duplicate `logger.info` in `connectDB()` so only the single `mongoose.connection.on('connected')` listener logs connection events.

### 5. Client Port Lifecycle & Clean Dist
- `client/scripts/cleanDist.js` provides clean teardown of `client/dist`.
- `client/scripts/killPort.js` defaults to port 3000.
- Wired `node scripts/killPort.js 3000 && vite` into `client/package.json` `"dev"` script to guarantee port 3000 is freed before Vite starts.

### 6. Test Suite Architecture & Individual Test Execution
- To prevent monolithic test suites from slowing down development as tests grow, `backend/scripts/runTest.js` provides selective test execution:
  - `npm test <test-name>` or `npm test -- <test-name>` executes only the targeted test.
  - `npm run test:health` executes `scripts/tests/health.test.js` directly.
  - Running `npm test` without arguments prompts the developer with the list of available individual tests.
- Native Node.js `fetch` and `assert` are used exclusively; zero third-party test runners (no Jest, Mocha, or Vitest).

---

## Phase 2 — Database Models & Schemas Findings (Entities 1–3)

### 7. Mongoose `9.12.0` Runtime & Hook Invariants
- **Array Discriminators require explicit `type` enum on `basePartSchema`:** Without an explicit `enum` on the base `discriminatorKey` field (`type`), Mongoose `9.12.0` falls back silently to `basePartSchema` for unknown discriminator types instead of throwing a `ValidationError`.
- **Subdocument array validators inside `findOneAndUpdate`:** Inside nested array subdocument path validators, `this?.getUpdate === 'function'` fires during `findOneAndUpdate(..., { runValidators: true })` in query context rather than subdocument context. Provider/model checks on array items (`errorPartSchema`) MUST run in subdocument `pre('validate')` plus query-level `pre(['findOneAndUpdate', 'updateOne'])` `$push` inspection.
- **Partial Projections (`Model.hydrate(doc, fields)`):** Document hooks (`pre('validate')`) and virtual getters (`isSelected(...)`) must fail closed on dependent sibling pairs (e.g., `titleSource` without `title`, `activeBranchId` without `branches`, `deletedAt` without `isDeleted`, `error.failedModel` without `error.failedProvider`) and return `undefined` (stripped in `sanitizeTransform`) for unselected virtuals.
- **Query Update Hooks (`pre(['findOneAndUpdate', 'updateOne'])`):** Mongoose 9 executes `timestamps: true` prior to query pre-hooks; conflict-safe `$set` injectors (`injectSetField`) must inspect non-`$set` operator layers (`$unset`, `$rename`, `$pull`) and top-level flat fields to prevent MongoDB update path conflicts.

### 8. LangChain v1, LangGraph (`MongoDBSaver`) & Gemini 3 Boundaries
- **6-Model Repository Architecture vs Master §10.1 Conceptual Entities:** Rather than splitting into 24 separate collections (`Turn`, `MessageBranch`, `AgentRun`, `ToolExecution`, `ActionApproval`), LangGraph's `MongoDBSaver` persists durable graph/tool loop state (`checkpoints` & `checkpoint_writes`), `Chat.js` holds bounded `branches` DAG descriptors + atomic `activeRun` lock/interrupts, and `Message.js` serves as the immutable owner-scoped ledger grouped by `turnId`, `branchId`, `attemptNumber`, and monotonic `(chat, sequence)`.
- **Chain-of-Thought Privacy vs Gemini 3 `thoughtSignature` Continuity:** V0 plaintext `thought` storage/UI rendering violates Master §26.6.9 #12. User-facing milestones live safely in `'step'` parts (`stepKey`, `durationMs`), while encrypted opaque Google API continuation tokens (`extras.signature`) live strictly in `opaqueSignatures` (`select: false`, stripped on `toJSON`/`toObject`).
- **Role-Aware Text Limits & Unified `Asset.js` Interlock:** Assistant responses (multi-branch dossiers / structured reports) exceed user 10,000-character limits (`ASSISTANT_TEXT_MAX_LENGTH = 100000` vs `USER_TEXT_MAX_LENGTH = 10000`). All binary uploads, audio recordings, TTS syntheses, and agent-generated downloadable files (`PDF`/`DOCX`/`XLSX`/`CSV`/`MD`/`JSON`) unify via `Asset._id` references rather than raw paths, `publicId`s, `Audio` splits, or in-memory download registries.

### 9. Unified `Asset.js` Architecture & Anti-Trap Invariants (Entity 4)
- **Elimination of V0 `Audio.js` Fragmentation & Ephemeral Map Registries:** V0 isolated audio into a separate `Audio.js` model and kept generated documents in an ephemeral `Map` inside `documentGenerationService.js` (lost on server restart). In V1, `Asset.js` unifies all 8 asset kinds (`user_avatar`, `chat_attachment`, `audio_recording`, `audio_evidence`, `report_attachment`, `generated_document`, `tts_audio`, `system_export`) under a single durable, owner-scoped collection.
- **Zero Public `/uploads` Static Directory Exposure:** V0 exposed sensitive user uploads directly via Express static middleware (`/uploads`). V1 eliminates public static delivery; all asset access is mediated by owner-scoped authenticated endpoints (`/api/v1/assets/:id/download`, `/api/v1/assets/:id/stream`, `/api/v1/assets/:id/view`) generated via virtual getters.
- **Storage Drivers & User-Scoped BYOK Cloudinary:** Storage driver abstraction (`local`, `cloudinary`, `google_drive`) supports local protected storage as the P0 fallback and Cloudinary with user-scoped BYOK encryption (keys in `User.integrations.cloudinary`). Storage paths and keys are sanitized against directory traversal (`..` sequences collapsed).
- **Two-Pass Sweeper Interlock (`Message.isAssetReferenced`):** Orphan cleanup in V1 verifies that an asset is not referenced across any message branch or active attempt via `Message.isAssetReferenced({ userId, assetId })` before marking for deletion or physically unlinking storage bytes, eliminating orphan sweeper race conditions.
- **Embedded Schema Objects with `{ _id: false }`:** All nested metadata sub-structures (`storage`, `metadata`, `transcription`, `extractedText`, `tts`, `provenance`) strictly use `EMBEDDED_SCHEMA_OPTIONS` with `{ _id: false }`, adhering to the Zero Subdocument Rule.

### 10. Operations Domain `Branch.js` & Audit Evidence Preservation (Entity 5)
- **Elimination of Cascading Deletion Trap (Anti-Trap §4.5 & Master §22):** In V0, `cascadeDeleteBranch` deleted reports attached to a branch. In V1, branch hard-deletion is strictly blocked if active or historical audit reports reference the branch (`canDeletePermanently` guard, `pre(['deleteOne', 'findOneAndDelete'])` hooks). Historical audit evidence is permanently preserved, and locations should be soft-archived (`isArchived: true`) instead.
- **Bilingual Discovery & Multilingual Text Search (`FR-DOM-REST-006`):** Branches support both English and Amharic names with transliterated `aliases` for bidirectional discovery. Supported by an owner-scoped compound text index with `default_language: 'none'`, preventing Ethiopic Fidel mangling by standard English language stemmers.
- **Single-User Ownership & Staff Identity Boundaries (`AGENTS.md` §2.1):** Every branch is strictly owned by `user` (`ref: 'User'`, required, immutable on update). Store managers (`managerName`, `contactPhone`) are domain record attributes, **never** authentication identities or application logins. Zero RBAC, zero staff logins.
- **Compound Partial Unique Indexes on Active Locations:** Ensures active branch names (case-insensitive via collation `{ locale: 'en', strength: 2 }`) and operational codes (`code: uppercase`) are unique per supervisor, while allowing archived records to retain historical codes without collision.
- **Embedded Schema Options Invariant:** Location details (`locationSchema`) use `EMBEDDED_SCHEMA_OPTIONS` with `{ _id: false, id: false }`.

### 11. Operations Domain `Report.js` — Streamlined Branch-Level Granularity, Narration & Zero-Subdocument Architecture (Entity 6)
- **Branch-Level Granularity & Daily Uniqueness (`user + branch + date`):** Shifted from daily multi-branch monoliths to exact branch-level reports. `branch` sits directly at the root (`ref: 'Branch'`, required, indexed). Uniqueness is enforced at the database level via a compound partial unique index on `{ user: 1, branch: 1, date: 1 }` with `{ isArchived: false }`.
- **Operational Narration over Transcription (`narration`):** Renamed from `transcription` to `narration`: the authoritative Amharic operational summary and executive dossier (required string, max 50,000 characters, weighted at 10 in full-text search).
- **Unified `Asset.js` Model:** Replaced fragmented `audios`, `attachments`, and `generatedFiles` arrays with a single unified `assets: [{ type: ObjectId, ref: 'Asset' }]` (capped at 30 assets). Reverse linkage is provided by `Asset.provenance.report = reportId`.
- **Zero Subdocuments Rule (`{ _id: false }`):** Eliminated standalone subdocument schemas (`visitSchema`, `activitySchema`, `issueSchema`, `commentSchema`). All arrays (`visits`, `activities`, `issues`, `comments`) are defined directly inline with `{ _id: false }`, producing plain objects without duplicate Mongoose `_id`s.
- **Pruning Speculative & Redundant Data Structures:**
  - Removed `notes` from visits: arrival and departure times (`clockIn`, `clockOut`) capture physical presence; observations live exclusively in `activities`, `issues`, `comments`, or `narration`.
  - Removed `customSectionSchema` and `metadata: Map`.
- **Deterministic UTC Date Normalization & Virtual Getters:** Stored `dateString` and `ethiopianDate` strings were eliminated from the database. The `date` field is normalized to UTC midnight (`YYYY-MM-DDT00:00:00.000Z`) in pre-validation and pre-update query hooks. `dateString` (YYYY-MM-DD) and `ethiopianDate` (DD-MM-YY) are exposed as derived virtual getters using deterministic Julian Day Number (JDN) algorithms.
- **Query Resolution Helpers:** `Report.buildIdentifierQuery` resolves queries by Mongo ObjectId, Gregorian date (`YYYY-MM-DD`), and Ethiopian date (`DD-MM-YY` or `DD/MM/YYYY`, with automatic slash-to-hyphen normalization and conversion to UTC midnight). `Report.buildDateRangeQuery` filters reports across date intervals and branches.
- **Branch Cascade Deletion Resistance Interlock:** Synchronized with `Branch.canDeletePermanently` by checking `{ branch: branchId }` (and legacy paths). `branchSchema.pre(['deleteOne', 'findOneAndDelete'])` delegates directly to `canDeletePermanently`, correctly distinguishing Query context (`this.model`) from Document context (`this.constructor`), failing closed if active reports exist.
- **Multilingual Ethiopic Text Search (`FR-DOM-REST-006`):** Owner-scoped compound text index specifies `default_language: 'none'` with field weights (`narration: 10`, `issues.text: 5`, `activities.text: 3`, `comments.text: 2`), ensuring Amharic Fidel words are searchable without language stemmer corruption.

### 12. Atlas Replica Set Runtime Discoveries & Verification Hardening (Phase 2 Models Implementation)
- **MongoDB Text Index Stemmer Protection & `language_override` Isolation:** By default, MongoDB text indexes treat any field named `language` in documents as the language override field. In documents with subfields such as `audioMetadata.language: null` or `runtimeConfig.language: null`, MongoDB threw `found language override field in document with non-string type`. Specifying `{ default_language: 'none', language_override: 'no_language_override' }` across all 5 text indexes (`Chat`, `Message`, `Asset`, `Branch`, `Report`) prevents MongoDB from checking `language` fields for stemming, perfectly protecting Ethiopic (Amharic) Fidel script while permitting nullable metadata fields.
- **MongoDB Partial Filter Expressions on TTL Indexes (`Asset.purgeAfter`):** MongoDB partial filter expressions do NOT support `$ne` (which compiles to `$not ... $eq`), throwing code 67 (`CannotCreateIndex`). The partial filter was updated to `{ purgeAfter: { $type: 'date' } }`, which is fully supported and indexes only documents where `purgeAfter` is an actual BSON Date instance.
- **Deterministic Julian Day Number (JDN) Calendar Engine:** Implemented pure mathematical JDN conversions in `backend/src/utils/ethiopianCalendar.js`, enabling bidirectional Gregorian and Ethiopian calendar conversion without external calendar libraries.
- **JSDoc Completeness:** Comprehensive, professional JSDoc headers, type annotations, and parameter descriptions were applied across all models (`User.js`, `Chat.js`, `Message.js`, `Asset.js`, `Branch.js`, `Report.js`, `index.js`), utilities (`constants.js`, `ethiopianCalendar.js`), and tests (`schema.test.js`).
- **Template Conformance:** `task_plan.md` was streamlined to adhere strictly to the `planning-with-files` skill template, removing inline code dumps (which are authoritatively held in `phase-2-database-models.md`) and maintaining a focused, clean roadmap.





