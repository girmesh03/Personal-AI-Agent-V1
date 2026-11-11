# Task Plan: Operon (Personal AI Agent V1) Engineering Roadmap

> **Product:** Operon (Personal AI Agent V1)  
> **Authority:** `AGENTS.md` & `docs/Master-Personal-AI-Agent-V1-documentation.md`  
> **Target Branch:** `phase-3-auth-profile-navigation`  
> **Current Status:** `ready` (Phase 2 Database Models Completed & Merged to main; Phase 3 Branch Initialized)  
> **Next Step:** Await owner instructions to begin Phase 3 (Auth, Sessions, Full Profile & Page Shell Navigation).

---

## Goal

Establish an authoritative, production-grade personal AI partner application (Operon) by incrementally executing approved engineering phases with zero defects, strict single-user data isolation, comprehensive native integration testing, and formal owner-approved verification gates.

---

## Next Step

Awaiting owner confirmation and direction to begin Phase 3 planning and implementation. Phase 2 models, JSDoc typedefs, and Atlas integration tests are committed and merged into `main`.

---

## Current Phase

Phase 3: Auth, Sessions, Full Profile & Page Shell Navigation.

---

## Governing Protocol (`phase-2-database-models.md`)

1. Append ONE entity/schema/model at a time in the plan.
2. Exhaustive cross-reference against V0 codebase exports, V1 master specification, and live provider documentation.
3. Zero blind copying of V0; zero blind acceptance of V1.
4. Strict LangChain & LangGraph compatibility across message structures and state boundaries.
5. Review, challenge, and amend each entity sequentially with the owner.
6. Implementation starts ONLY after all 6 schemas are amended and approved.
7. Commit ONLY on explicit owner approval or request.

---

## Phases & Progress Tracking

### Phase 1 — Full-Stack Foundation and Engineering Quality System [COMPLETED & MERGED]

| Task ID | Description | Status | Verification Evidence | Owner Decision Gate |
|---|---|---|---|---|
| **Task 0** | Deep Codebase Audit, Preflight Stages A–E, and Governance Registers | `complete` | Baseline registers created, Preflight Report (A–K) approved | **GATE 1: Preflight Approval [APPROVED]** |
| **Task 1.1** | Backend Core Config, Constants, Logger & Universal Error Hierarchy | `complete` | Modules verified, committed (`58bb106`) | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.2** | Database Connection & Lifecycle Manager | `complete` | `db.js` & `schemaOptions.js` verified, committed (`67e3d3b`) | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.3** | Central Routing Architecture, Express 5 Composition & Health API | `complete` | Verified 200/404, clean HTTP logging | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.4** | Backend Quality Verification & Deterministic Postman-Style Test Suite | `complete` | `runTest.js` & `test:health` individual test execution passing (4/4) | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.5** | Client Dependencies, Verification Script & Protected Theme Mounting | `complete` | Clean `App.jsx` mounting `AppTheme`, `verify --workspace=client` passing | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.6** | Monorepo Orchestration & Workspace Verification | `complete` | `npm run verify` passing across workspaces (backend syntax + client lint/build) | Task Acceptance & Commit Auth [APPROVED] |
| **Task 1.7** | Antigravity Browser Verification & Phase Review Gate | `complete` | Merged to `main` (`d91976a`), pushed, branch cleaned up | **GATE 2: Phase 1 Review & Sign-off [APPROVED]** |

---

### Phase 2 — Database Models & Schemas (Entire Codebase) [COMPLETED & MERGED]

*Detailed architectural definitions, schema code, provider research, and LangChain contracts are authoritatively maintained in Artifact [`phase-2-database-models.md`](file:///C:/Users/girma/.gemini/antigravity/brain/3a80cd75-49f2-40b0-8770-48c745a6e712/phase-2-database-models.md).*

| Task ID | Description | Status | Verification Evidence | Owner Decision Gate |
|---|---|---|---|---|
| **Task 2.1** | `User.js` Entity Specification & Review | `complete` | Single-user isolation, bcrypt hashing, Gemini 3 + Addis AI settings, encrypted credentials, 100% GREEN gate (`0105bf95`) | Gate: Specification Approved [APPROVED] |
| **Task 2.2** | `Chat.js` Entity Specification & Review | `complete` | Zero embedded `messages` array, LangGraph thread DAG branching, 100% GREEN gate (`a3d57651`) | Gate: Specification Approved [APPROVED] |
| **Task 2.3** | `Message.js` Entity Specification & Review | `complete` | Standalone collection, polymorphic parts (`text`, `asset`, `tool`, `thought`, `citation`), 100% GREEN gate (`a3d57651`) | Gate: Specification Approved [APPROVED] |
| **Task 2.4** | `Asset.js` Entity Specification & Review | `complete` | Modality-neutral registry, nested storage, reverse provenance, TTL index on `purgeAfter`, 100% GREEN gate (`a3d57651`) | Gate: Specification Approved [APPROVED] |
| **Task 2.5** | `Branch.js` Entity Specification & Review | `complete` | Physical branch directory, fail-closed deletion blocked by existing audit reports, 100% GREEN gate (`a3d57651`) | Gate: Specification Approved [APPROVED] |
| **Task 2.6** | `Report.js` Entity Specification & Review | `complete` | Streamlined schema, zero subdocument `_id`, inline arrays, UTC midnight date normalization, JDN virtuals, compound partial unique index, 100% GREEN gate (`a3d57651`) | Gate: Specification Approved [APPROVED] |
| **Task 2.7** | Models Physical Implementation & Native Atlas Integration Test Suite | `complete` | All 6 models implemented in `backend/src/models/`, native test suite `backend/scripts/tests/schema.test.js` passing 11/11 tests against live MongoDB Atlas replica set, `npm run verify` passing 100%, 15/15 test suite passing, merged to `main` | **GATE 3: Phase 2 Review & Sign-off [APPROVED]** |

---

### Phase 3 — Authentication, Session Lifecycle, and Security Core [PENDING]

- [ ] Implement JWT access & refresh token lifecycle with HTTP-only cookies and automatic token rotation.
- [ ] Implement local registration, login, logout, password change, and password reset endpoints.
- [ ] Implement Google SSO OAuth callback with CSRF-protected state verification and automatic local account linking.
- [ ] Implement session manager with family tracking, concurrent session limits, and revoke-all capability.
- [ ] Implement AES-256-GCM envelope encryption service for BYOK provider credentials.
- [ ] Implement rate-limiting, CORS, security headers, and input sanitization middleware.
- **Status:** pending

---

### Phase 4 — Unified Ingestion, Storage & Asset Management [PENDING]

- [ ] Implement multi-driver storage service (`local`, `cloudinary`, `google_drive`).
- [ ] Implement secure file upload controller with MIME validation, magic byte checking, and file size quotas.
- [ ] Implement text extraction service (PDF, DOCX, XLSX, CSV, Markdown, plain text).
- [ ] Implement audio processing service (FFmpeg conversion, waveform extraction, duration calculation).
- [ ] Implement image optimization service (metadata stripping, thumbnail generation, progressive JPEG/WebP).
- [ ] Implement background asset orphan sweeper and TTL purge worker.
- **Status:** pending

---

### Phase 5 — Model Provider Engine & Streaming Transport [PENDING]

- [ ] Implement Google Gemini 3 provider adapter (`@langchain/google-genai` / `@google/genai`) with thinking budget and tool calling.
- [ ] Implement Addis AI provider adapter with streaming fallback and Amharic language optimization.
- [ ] Implement provider factory with dynamic runtime configuration and failover policies.
- [ ] Implement Server-Sent Events (SSE) streaming transport with structured event typing (`text`, `tool`, `thought`, `citation`, `status`, `done`, `error`).
- [ ] Implement client-side SSE consumer hook with robust reconnect, cancellation, and message accumulation.
- **Status:** pending

---

### Phase 6 — LangGraph Agent Runtime, Tools & Approvals [PENDING]

- [ ] Build LangGraph state machine with thread checkpointers and state persistence.
- [ ] Implement human-in-the-loop (HITL) interrupt and approval workflow for destructive and external tools.
- [ ] Implement core tools: Web search, calculator, document QA, code runner, reminder scheduler.
- [ ] Implement operations tools: Branch lookup, report generation, dossier export, activity tracking.
- [ ] Implement conversation DAG branching, turn editing, and alternative timeline generation.
- **Status:** pending

---

### Phase 7 — Operations Module, Reporting & Integrations [PENDING]

- [ ] Implement branch management API routes and controllers (CRUD, archive, restore).
- [ ] Implement operational report API routes and controllers (daily reporting, activities, issues, comments).
- [ ] Implement Amharic/English PDF dossier rendering engine with Ethiopic font support.
- [ ] Implement Google Drive backup connector.
- [ ] Implement Telegram delivery connector.
- [ ] Implement daily operations briefing generator.
- **Status:** pending

---

## Key Questions & Decisions Made

| Decision | Rationale |
|---|---|
| **6-Model Monorepo Architecture** | Consolidates all application data into 6 cohesive domain models (`User`, `Chat`, `Message`, `Asset`, `Branch`, `Report`), avoiding directory bloat while cleanly isolating optional operations. |
| **Strict Single-User Invariant** | Operon is a private personal AI partner for one individual. Zero RBAC, zero organization tenancy, zero shared workspaces. All queries are strictly scoped to the authenticated `user`. |
| **Separation of Chat & Message** | Chat stores thread metadata and LangGraph DAG state. Messages are stored as a standalone collection with foreign key `chat`, eliminating MongoDB document size limit (16MB) bloat and race conditions. |
| **Polymorphic Message Parts** | Mirrors modern AI message streaming architectures (LangChain / Gemini), enabling text, tool calls, citations, artifacts, and thoughts to coexist in a structured, observable timeline. |
| **Streamlined Report Architecture** | Eliminates artificial subdocument wrappers; embeds `visits`, `activities`, `issues`, and `comments` inline with `{ _id: false }`. Normalizes dates to UTC midnight and exposes deterministic JDN virtuals (`dateString`, `ethiopianDate`). |
| **Full-Text Search Stemmer Protection** | All text indexes specify `{ default_language: 'none', language_override: 'no_language_override' }`, preventing Snowball stemmer from corrupting Ethiopic characters and avoiding errors on `language: null` subfields. |
| **Asset TTL Index Compliance** | TTL index on `purgeAfter` uses `{ expireAfterSeconds: 0, partialFilterExpression: { purgeAfter: { $type: 'date' } } }`, complying with MongoDB's constraint against `$ne` in partial indexes. |

---

## Errors Encountered & Resolutions

| Issue / Defect Observed | Root Cause | Resolution |
|---|---|---|
| MongoDB duplicate index warning on `Asset.purgeAfter` | Both inline `index: true` and explicit schema index existed | Removed `index: true` from schema definition, retained explicit TTL index |
| `E11000 duplicate key error` on `messages` index | 23 legacy documents from early tests had `chat: null` | Dropped legacy test documents from Atlas; rebuilt unique compound index `{ chat: 1, sequence: 1 }` |
| `found language override field in document with non-string type` | MongoDB text indexes default to `language_override: 'language'`; documents with `language: null` triggered IndexKeyProvider errors | Specified `language_override: 'no_language_override'` on all 5 text indexes across `Chat`, `Message`, `Asset`, `Branch`, and `Report` |
| `CannotCreateIndex` on `Asset.purgeAfter` with `$ne: null` | MongoDB partial filter expressions do not support `$ne` (which compiles to `$not ... $eq`) | Changed partial filter expression to `{ purgeAfter: { $type: 'date' } }`, which is fully supported and indexes only actual date instances |
| Message citation validation failure | Test payload omitted required `sourceType` for citation parts | Added `sourceType: 'url'` to citation payload in `schema.test.js` |
| Barrel export `UserModel is not defined` | Re-export syntax `export { default as UserModel }` does not bring symbols into local module scope | Switched `backend/src/models/index.js` to standard static imports and named/default exports |

---

## Notes

- All changes remain uncommitted on branch `phase-2-database-models` until explicit owner authorization.
- Verification commands:
  - `npm run test:schema` (runs `backend/scripts/tests/schema.test.js` against live MongoDB Atlas replica set)
  - `npm test --workspace=backend` (runs all backend integration tests: Health + Schema)
  - `npm run verify` (runs backend syntax verification across all source files + client ESLint + client Vite build)
