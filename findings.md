# Findings & Architecture Discoveries: Personal AI Agent V1 (Operon)

Authoritative Reference: `docs/Master-Personal-AI-Agent-V1-documentation.md`

## 1. Specification & Requirements Findings
- **Product Identity:** Personal AI Agent V1 (Operon) is an individual, general-purpose private AI partner for professional and personal life. It is NOT globally branded or constrained as a restaurant reporting tool.
- **Operations Domain Module:** The restaurant supervision capabilities (branches, reports, visits, issues, Ethiopian calendar, bilingual Amharic dossiers) must remain 100% functional, but encapsulated as an isolated, detachable domain module (`modules/operations/`).
- **Requirements Breakdown:** 52 total requirements:
  - 43 Core Platform (27 P0, 15 P1, 1 P2)
  - 9 Operations Domain Module (1 P0 isolation gate, 8 P1 functional requirements)
  - Combined: 28 P0, 23 P1, 1 P2.
- **Provider Architecture:** Extensible provider registry. Initial LLM providers:
  1. Google Gemini via `@langchain/google` (`ChatGoogle`).
  2. Addis AI via `@langchain/openai` (`ChatOpenAI` configured with custom `baseURL`).
  - **PROHIBITION:** Complete architectural ban on `@google/genai` and raw `GoogleGenAI` SDK.
  - Both inherit from LangChain's `BaseChatModel`, presenting an identical uniform interface (`.invoke()`, `.stream()`, `.bindTools()`) to application services and agents.
  - Remote model inference only. Absolutely no local LLMs, no local OCR, no local whisper/speech models, no local embedding models.
- **Chat State Ownership:** Single canonical chat runtime on frontend (MUI X Chat adapter) translating a canonical server-side SSE event stream. No competing Redux live-message store.

## 2. Repository & Infrastructure Baseline
- **Operating System:** Windows (PowerShell 5.1).
- **Node.js Runtime:** `v24.15.0`.
- **npm Package Manager:** `11.11.0`.
- **Current Git Branch:** `main` (Unborn, no commits yet).
- **Remote Git Status:** `origin` configured to `https://github.com/girmesh03/Personal-AI-Agent-V1.git`. Remote repository is completely empty (`git ls-remote origin` returned 0 branches/tags/commits).
- **Single Root Manifest Rule:**
  - Root `package.json` currently declares `"workspaces": ["backend", "client"]`.
  - Nested manifests exist: `backend/package.json` and `client/package.json` (and `client/package-lock.json`).
  - Master specification Section 6.3 mandates a single root `package.json` and single root `package-lock.json`. Nested manifests and lockfiles must be retired.
  - **Package Installation Policy:** Never hand-code version numbers in `package.json`. Always run native `npm install` from root so npm resolves current compatible versions and produces the root `package-lock.json`.
  - **Cloud Deployment Architecture:**
    - Render (`render.yaml`): `rootDir: .`, `buildCommand: npm install --include=optional`, `startCommand: npm run start:api`. Automatic Ethiopic fonts/FFmpeg permission install via root `postinstall`.
    - Vercel (`vercel.json`): `buildCommand: npm run build:web`, `outputDirectory: client/dist`, `framework: vite`. Vercel builds from root and serves `client/dist`.
- **Existing Scripts Accounting:**
  - `backend/scripts/installFonts.js`: Headless font and binary permission installer for Render/Docker. Wired to root `"postinstall": "node backend/scripts/installFonts.js"`.
  - `backend/scripts/killPort.js`: Cross-platform TCP port termination. Wired to root `"kill-ports": "node backend/scripts/killPort.js"` and pre-dev commands.
  - `client/scripts/cleanDist.js`: Client build directory cleaner. Wired to root `"clean:client": "node client/scripts/cleanDist.js"`.
  - `client/scripts/killPort.js`: Port 3000 cleaner. Preserved for client-specific targeting.

## 3. Historical Codebase Source Inventory (V0 Reference)
- Authoritative exports verified:
  - `docs/Backend-Personal-AI-Agent-V0-Codebase.md`: 61 source sections, 21,491 lines.
  - `docs/Client-Personal-AI-Agent-V0-Codebase.md`: 153 source sections, 39,082 lines.
  - Total source sections: **214 sections**.
- All 214 sections have been cross-checked and mapped in `docs/implementation/source-disposition.md`.
- Functional capabilities to preserve:
  - Authentication, sessions, profile, preferences, BYOK credentials.
  - Chat management, message history, streaming, stop, retry, continue, edit, branching.
  - File upload, preview, extraction, citations, durable multi-turn context (images, audio, PDF, DOCX, XLSX, CSV, TXT, Markdown).
  - Document generation (PDF with Ethiopic fonts, DOCX, XLSX, CSV, Markdown, JSON).
  - Connectors (Google Drive with signed OAuth, Telegram with message preview/approval).
  - Operations domain (branches, reports, visits, issues, Ethiopian calendar, bilingual Amharic dossiers).

## 4. Protected Assets
- **Material UI Theme (`client/src/theme/`):**
  - Fully implemented design system with design tokens (`themePrimitives.js`), color schemes, CSS baseline, and component customizations for inputs, data display, feedback, navigation, surfaces, charts, dataGrid, datePickers, and chat streaming/typing indicators (`AppTheme.jsx`).
  - Marked strictly **PROTECTED**. No modifications permitted unless a genuine runtime defect originating inside the theme itself is reproduced, documented, and approved by the owner.
- **Font Assets (`backend/src/assets/fonts/`):**
  - 8 font files for Latin and Ethiopic typography (`Inter-Bold.ttf`, `Inter-Regular.ttf`, `NotoSansEthiopic-Bold.ttf/woff`, `NotoSansEthiopic-Regular.ttf/woff`, `NotoSansLatin-Bold.ttf/Regular.ttf`) plus `fonts.conf`.

## 5. Agents, Skills, and Plugins Inventory
- Installed under `.agents/`:
  - `superpowers` plugin (v6.3.0) with 15 process/engineering skills, 4 subagents (`code-reviewer`, `implementer`, `re-reviewer`, `spec-reviewer`), rules (`using-superpowers.md`), and test suites.
  - 23 skills in `.agents/skills/`, locked by `skills-lock.json`, covering LangChain, LangGraph, Deep Agents, Swarm, Eval Engineering, and Planning with Files.

## 6. Testing Architecture Decisions
- **Backend API Testing:**
  - Postman-style end-to-end HTTP integration tests using native Node.js HTTP/fetch requests and assertions against the actual running Express app on a dedicated test port.
  - Tests exercise full stack: HTTP route -> middleware -> validation -> controller -> service -> Mongo database -> SSE stream parser.
  - Isolated test database (`operon-test`). No mocked controller unit tests as substitute for API tests.
- **Frontend Verification & Owner Approval Gate:**
  - Static checks, ESLint, type-checking, and production Vite builds run automatically.
  - **MANDATORY GATE:** Antigravity browser testing is strictly owner-controlled. The agent must NEVER launch or automate browser testing without preparing the test plan and receiving explicit owner approval.

## 7. Base Express Application Bootstrap & Security Architecture
- **Environment Schema (`config/env.js`):**
  - Fully schema-validated via Zod. Replaces V0's unvalidated array checks with strict type coercion, defaults, duration parsing (`parseDurationToMs`), and test environment fallbacks.
  - Deeply frozen `env` object prevents runtime configuration mutation.
- **Error Architecture (`shared/errors/AppError.js`):**
  - Inherits from `AppError` base class with `isOperational = true`, `statusCode`, `errorCode`, and `details`.
  - Invariant strictly enforced: 401 status is `UNAUTHENTICATED` (never `UNAUTHORIZED`).
  - Compatibility bridges established for `errors/CustomError.js`, `middleware/errorHandler.js`, `middleware/notFoundHandler.js`, and `routes/index.js`.
- **Security Middlewares (`app.js`):**
  - Standard Helmet security headers (`nosniff`, `SAMEORIGIN`, etc.).
  - CORS with exact allowed origins from `CLIENT_ORIGIN` plus local dev ports and production `*.vercel.app`.
  - JSON and URL-encoded body parsers with 10MB bounds.
  - **Prohibition Enforced:** Direct public static upload serving (`express.static('/uploads')`) is omitted completely. All asset access will require authenticated, owner-scoped download routes.
- **Native Postman-Style HTTP Integration Harness (`tests/api/health.test.js`):**
  - Real over-the-wire HTTP requests to ephemeral port using native Node.js test runner (`node:test`) and native `fetch`.
  - 6 test cases covering canonical `/api/v1/health`, `/health`, `/api/health`, 404 structured envelope, Helmet security headers, and CORS credentials.
  - Extraneous `/healthz` container alias was removed to strictly adhere to the master specification and historical contract.
  - 100% pass rate in < 2 seconds.

## 8. TypeScript Declaration & IDE Workspace Configuration
- **Type Declaration Strategy:**
  - Standardized on official `@types/*` devDependencies for plain JavaScript libraries lacking built-in types:
    `@types/node`, `@types/express`, `@types/morgan`, `@types/cors`, `@types/cookie-parser`, `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/multer`.
  - Installed via native `npm install -D` without hardcoded versions.
- **Root Workspace Configuration (`jsconfig.json`):**
  - Configured ES2022 / NodeNext module resolution, `checkJs: false`, and `skipLibCheck: true`.
  - Resolves all implicit-any diagnostics while providing full autocomplete, parameter hints, and type safety for developer ergonomics.

## 9. Phase 1 Completion & Gate Merge Review
- **Deliverables:** Single root manifest and lockfile, consolidated dependencies, build and lint pipelines, base Express 5 app, Zod environment validation, operational error handling, Winston structured logging, native API health test suite, and cloud deployment manifests (`render.yaml`, `vercel.json`).
- **Gate Status:** 100% verified and approved by owner. Merged to `main` via fast-forward merge. Ready for Phase 2 initialization.

## 10. Phase 2 Identity & Session Security Architecture (Task 2.1)
- **Database Connection Engine (`infrastructure/database/connection.js`):**
  - Exponential backoff (1s -> 2s -> 4s -> ... up to 30s) with 10% random jitter.
  - Exposes `isDbConnected()` and `getDbStatus()` allowing `/health` and `/api/v1/health` probes to distinguish HTTP service health from database readiness.
- **Session Registry & Breach Detection (`modules/identity/domain/Session.js`):**
  - **No Plaintext Tokens:** Refresh tokens are hashed via SHA-256 before persistence.
  - **Family Lineage:** Each login establishes a unique `family` UUID. When rotating a token (`rotateSession`), the old session is marked revoked, and the new session inherits the same family.
  - **Replay / Breach Detection:** If a client presents an already revoked refresh token (indicating token theft / interception), the engine revokes *all* active sessions in that family immediately and throws `UnauthenticatedError('... TOKEN_REUSE_DETECTED')`.
  - **TTL Expiration:** MongoDB TTL index automatically cleans up expired sessions without needing manual cron jobs.
- **User Domain Model (`modules/identity/domain/User.js`):**
  - Password hashed using `bcryptjs` with 12 salt rounds in an async pre-save hook.
  - Safe serialization: `toJSON` strips password, third-party integration tokens (Google Drive access/refresh tokens, Telegram botToken), and raw API keys, while projecting boolean capability flags (`hasGeminiKey`, `hasAddisKey`).
- **External Provider Linking (`modules/identity/domain/AuthIdentity.js`):**
  - Normalizes external OAuth identities with compound unique index on `{ provider: 1, providerId: 1 }`.

## 11. Authentication Services & Controllers Architecture (Task 2.2)
- **Token Infrastructure (`infrastructure/security/tokenService.js`):**
  - Dual JWT issuance: short-lived 15m `accessToken` and 7d `refreshToken` (uniform lifespan, strictly zero remember-me variation).
  - Secure HttpOnly cookies with `sameSite: 'lax'` (development) / `sameSite: 'none'` (production with HTTPS) and `path: '/'`.
  - Comprehensive clearing across `/`, `/api/v1`, and `/api/v1/auth`.
- **Validation Engine (`infrastructure/http/middleware/validate.js` & `modules/identity/http/authSchemas.js`):**
  - Replaced legacy `express-validator` with type-safe Zod schema validation middleware.
  - Strict enforcement of Single-User Invariant: injecting `role` is immediately rejected with 400 Bad Request.
  - Password complexity checked against canonical character class `[A-Za-z\d@$!%*?&]`.
- **Google OAuth 2.0 & SSO (`modules/identity/services/googleAuthService.js`):**
  - Zero heavy external dependencies: leverages native Node.js `fetch` for Google OpenID Connect endpoints.
  - Tamper-proof HMAC signed state token signed with `JWT_ACCESS_SECRET` prevents OAuth CSRF attacks.
  - Graceful fallback: when Google OAuth credentials are not configured, endpoints report unconfigured state rather than crashing.
- **Session Registry Integration:**
  - Login creates new session with fresh UUID `family`.
  - Refresh rotates token within the same family.
  - Replay of revoked tokens immediately terminates the entire lineage with `TOKEN_REUSE_DETECTED`.

## 12. Session Middleware, CSRF Protection, and Rate Limiting (Task 2.3)
- **Server-Derived Identity Invariant (`infrastructure/http/middleware/requireUser.js`):**
  - Resolves identity strictly from verified JWT access tokens (via HttpOnly cookies or Bearer header).
  - Client-supplied `userId`, query params, or body claims are never trusted for authorization.
  - Attaches verified User model, `req.userId`, and frozen `req.auth = { userId, email }`.
  - Provides `optionalUser` middleware for optional-authentication routes.
- **CSRF Mitigation Architecture (`infrastructure/http/middleware/csrfProtection.js`):**
  - Defends against ambient cookie credential exploitation on state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Safe methods (`GET`, `HEAD`, `OPTIONS`) and public onboarding endpoints are exempted.
  - Requests carrying explicit Bearer authorization headers are exempted (browsers do not attach Bearer headers automatically cross-origin).
  - For cookie-authenticated requests, enforces strict `Origin` and `Referer` validation against allowed origins (`CLIENT_ORIGIN`, localhost dev ports, and production `*.vercel.app`).
  - Supports double-submit CSRF cookie/header matching (`X-CSRF-Token`).
- **CORS Error Normalization (`app.js`):**
  - Cross-origin requests from disallowed origins are cleanly intercepted and thrown as `ForbiddenError` (403 `CORS_ORIGIN_BLOCKED`) rather than generic 500 exceptions.
- **Rate Limiting Engine (`infrastructure/http/middleware/rateLimiter.js`):**
  - Powered by `express-rate-limit`.
  - `authRateLimiter`: 30 requests per 15 minutes per IP on `/api/v1/auth/*` to prevent brute-force attacks.
  - `apiRateLimiter`: 300 requests per 15 minutes per IP on general `/api/v1/*`.
  - Automatically raises thresholds during test environments (`NODE_ENV === 'test'`) to avoid false-positive test suite throttling.

## 13. Authenticated Credential Envelope Encryption (Task 2.4)
- **Standard & Algorithm Compliance (NFR-SEC-002, Scenario U):**
  - Implemented AES-256-GCM envelope encryption with unique 96-bit (12-byte) initialization vectors (IVs) per NIST SP 800-38D.
  - KEK (Key Encryption Key) derived via HKDF-SHA256 from `CREDENTIAL_ENCRYPTION_KEY` (with fallback to `JWT_ACCESS_SECRET` in development/test), tagged with version identifier (`v1`).
  - Ephemeral DEK (Data Encryption Key) generated freshly per credential, encrypted under KEK, and its plaintext memory securely wiped (`dek.fill(0)`) in a `finally` block immediately after use.
  - Authenticated Additional Data (AAD) cryptographically binds the payload and DEK to `{ userId, credentialType, version, role }`, preventing ciphertext transposition or unauthorized cross-user replay.
- **Key Rotation & Serialization:**
  - `rotateCredentialEnvelope`: re-encrypts stored credentials under a new KEK version without decrypting to disk.
  - `serializeEnvelope` / `deserializeEnvelope`: safe base64-encoded JSON representation suitable for database storage and retrieval.
- **User Domain Model Integration (`modules/identity/domain/User.js`):**
  - `setEncryptedApiKey`: automatically encrypts and serializes BYOK keys (`geminiApiKey`, `addisApiKey`), maintaining boolean presence flags.
  - `getDecryptedApiKey`: decrypts keys strictly in volatile memory on demand during authorized requests.
  - `getRedactedApiKey` / `redactCredential`: displays masked placeholders (e.g. `sk-a...7890`) for logs and UI display, returning `"Not Set"` when absent.
  - `toJSON`: completely strips raw and encrypted key fields from client API responses, exposing only boolean status flags (`hasGeminiKey`, `hasAddisKey`).
- **Profile & BYOK HTTP Routes:**
  - `GET /api/v1/users/profile`: authenticated profile retrieval.
  - `PATCH /api/v1/users/profile`: profile information update.
  - `PATCH /api/v1/users/api-keys`: updates BYOK keys using envelope encryption; raw DB record stores only ciphertext.
  - `GET /api/v1/users/api-keys`: returns masked key status without exposing plaintext secrets.
  - Compatibility bridges established for `backend/src/controllers/userController.js` and `backend/src/routes/userRoutes.js`.

## 14. Phase 2 Identity, Session & Account Security Acceptance Suite (Task 2.5)
- **Data Isolation & Anti-IDOR Architecture (`infrastructure/security/userIsolation.js`):**
  - Implemented `assertUserOwnership(resource, userId, ownerField)`: guarantees that unauthorized attempts to access or mutate foreign resources throw the exact same `NotFoundError` (404 `NOT_FOUND`) as missing resources, preventing IDOR enumeration per `NFR-SEC-004`.
  - Implemented `buildOwnerQuery(userId, query, ownerField)`: forces all database lookup and mutation queries to include the authenticated owner boundary.
- **Account Data Export & Permanent Deletion Lifecycle (`modules/identity/services/accountService.js`):**
  - Implemented `exportAccountData(userId)`: extracts user profile, settings, and nonsecret metadata while strictly omitting passwords, raw API keys, and session tokens (`FR-CORE-SEC-003`).
  - Implemented `deleteAccount(userId)`: purges User document, all associated Sessions, and linked AuthIdentities, followed by cookie clearing. Subsequent login attempts are immediately rejected.
- **JWT Collision Mitigation (`infrastructure/security/tokenService.js`):**
  - Added RFC 7519 `jti` (random UUID) to both access and refresh JWT payloads.
  - Prevents hash collisions in MongoDB's unique index on `refreshTokenHash` when rapid or concurrent tokens are generated within the same second for the same user.
- **Accepted Acceptance Scenarios Verified in `tests/api/identity-suite.test.js`:**
  - Full registration, password hashing, HttpOnly cookie issuance, and session reload without localStorage identity authority.
  - Concurrent token rotation and immediate replay breach detection terminating the entire session family (`TOKEN_REUSE_DETECTED`).
  - OAuth state tampering and missing state parameter rejection.
  - Cross-user IDOR rejection ensuring server-derived identity strictly governs data access.
  - Zero plaintext secrets across all responses.
  - Clean account data export and complete database account deletion.

## 15. Private Object Storage Abstraction & Unified Asset Model (Task 3.1)
- **Zero Public Exposure Invariant (`FR-CORE-DOC-003`):**
  - Public static upload serving (`express.static('/uploads')`) is strictly prohibited.
  - All files are stored under private paths unreachable by static web servers (e.g. `storage/private/{userId}/{year}/{month}/{storageKey}`).
  - Direct URL access to stored files is impossible without ownership-validated signed tokens or session middleware.
- **Path Traversal & Ingestion Defenses:**
  - `sanitizeFilename` strips null bytes, directory traversal sequences (`../`), control characters, and special characters.
  - `resolveSafeStoragePath` verifies that every target path stays strictly inside the designated private storage root.
- **Real-Time Streaming Integrity:**
  - `writeStream` incrementally computes SHA-256 digests on binary streams and enforces hard size limits (`maxSizeBytes`), automatically deleting partial files if the limit is exceeded.
- **Short-Lived Signed Download Authorization:**
  - Download access uses HMAC-SHA256 tokens (`generateSignedDownloadToken` / `verifySignedDownloadToken`) containing `assetId`, `userId`, and `expiresAt` (default 15 minutes).
  - Validated using constant-time comparison (`crypto.timingSafeEqual`) after length validation to prevent timing attacks.
- **Unified Asset Domain Model (`modules/assets/persistence/Asset.js`):**
  - Consolidates all user attachments, documents, audio recordings, and media under a unified schema.
  - Replaces legacy fragmented models (such as standalone `Audio.js` per row 51 of `source-disposition.md`).
  - Stores rich multimodal representations: `extractedText`, `transcript` (with engine, duration, language), `preview`, and `metadata`.
  - Provides backward-compatibility virtuals (`user`, `fileName`, `size`, `transcription`, `duration`, `sttEngine`) to ensure uninterrupted continuity for legacy consumers.

## 16. Secure Streaming Multipart Upload Pipeline & MIME Sniffing (Task 3.2)
- **MIME Magic-Byte Sniffing (`modules/assets/validation/mimeSniffer.js`):**
  - Deterministically inspects initial file headers (magic bytes) to ascertain actual binary format rather than trusting client-provided `Content-Type` headers or file extensions.
  - Detects and strictly rejects executable binaries and scripts: Windows PE (`MZ`), Linux ELF (`\x7FELF`), Java bytecode (`0xCA, 0xFE, 0xBA, 0xBE`), Mach-O binaries, and shell scripts (`#!/`) with 400 Bad Request (`EXECUTABLE_NOT_PERMITTED`).
  - Verifies authentic format signatures for PDF, PNG, JPEG, GIF, WebP, WAV, MP3, OGG, FLAC, WebM, DOCX, XLSX, JSON, CSV, and plain text.
  - Detects contradictions between declared client MIME types and verified magic bytes, rejecting mismatches with 400 Bad Request (`INVALID_FILE_TYPE`).
- **Multipart Upload Ingestion Pipeline (`modules/assets/http/uploadMiddleware.js`):**
  - Chunks stream into private temporary staging directories (`storage/private/temp`) with UUID filenames.
  - Enforces strict single-file caps (50MB), batch file limits (5 files), and cumulative batch size validation (50MB).
  - Unlinks empty files (0 bytes) and rejects with 400 Bad Request (`EMPTY_FILE`).
  - Implements automatic cleanup on failure, guaranteeing zero orphaned temporary files on aborted or invalid uploads.
- **Asset Service & HTTP Controller (`modules/assets/services/assetService.js`, `modules/assets/http/assetController.js`):**
  - Streams temporary files directly into user-partitioned private storage (`storage/private/{userId}/{year}/{month}/{storageKey}`) with SHA-256 integrity calculation.
  - Creates unified `Asset` documents in MongoDB linked to authenticated owner.
  - Maps internal records into client-safe DTOs, strictly concealing internal filesystem paths and private storage keys.
  - Enforces user isolation (`NFR-SEC-004`) returning uniform 404 `NOT_FOUND` on foreign asset access.
  - Multi-file batch uploads include atomic rollback: if an asset in a batch fails, previously stored assets in that batch are cleanly removed from storage and database.
- **Route Mounting & Backward Compatibility:**
  - Mounted `/api/v1/assets` in `backend/src/infrastructure/http/routes.js` with `requireUser` and `csrfProtection`.
  - Established compatibility bridge in `backend/src/middleware/uploadMiddleware.js` re-exporting `uploadSingleAudioMiddleware`, `uploadReportAudiosMiddleware`, and `uploadChatAttachmentsMiddleware`.
  - Updated `docs/implementation/source-disposition.md` row 11 (`backend/src/middleware/uploadMiddleware.js`) to `Implemented (Phase 3, Task 3.2)`.

## 17. Deterministic Document Parsing & Multimodal Text Ingestion (Task 3.3)
- **Universal Multi-Format Ingestion Engine (`modules/documents/ingestion/documentParser.js`):**
  - Modular parser architecture providing clean, isolated parsers for each document category:
    - **PDF (`parsePdf`):** Native `pdf-parse` integration extracting normalized text content, page counts, document metadata (title, author, creation date), and calculating word counts.
    - **DOCX (`parseDocx`):** Native `mammoth` integration extracting plain raw text from Word documents.
    - **Spreadsheets (`parseSpreadsheet` - XLSX / XLS / CSV):** Native `exceljs` streaming extraction parsing every worksheet, generating tabular row/column structures, and deriving markdown table representations.
    - **Plain Text / Markdown / Code / JSON (`parsePlainText`):** Deterministic UTF-8 stream decoding, line count calculation, JSON structural validation, and word count derivation.
- **Defensive Extraction Bounds & Resource Safeguards:**
  - Governed by `DOCUMENT_PARSING_LIMITS` in `backend/src/utils/constants.js`:
    - `MAX_PARSED_CHARS = 500,000` (~100k tokens) preventing unbounded memory exhaustion.
    - `PREVIEW_CHARS = 1,000` for compact UI summaries.
    - `MAX_SPREADSHEET_ROWS = 5,000` and `MAX_SPREADSHEET_COLS = 50` preventing tabular DoS.
  - Automatically flags `isTruncated: true` when file contents exceed configured size bounds.
- **Asset Service Extraction Integration (`extractAssetContent`):**
  - Authenticated and user-scoped extraction method in `modules/assets/services/assetService.js`.
  - Replaces historical unisolated attachment processing from `backend/src/utils/attachmentProcessor.js`.
  - Persists extracted text and rich preview directly into `representations.extractedText` and `representations.preview` on the `Asset` document.
  - Exposed via `POST /api/v1/assets/:id/extract`.

## 18. Full Codebase Consistency Audit & Performance Engineering
- **Line-by-Line Codebase Audit:**
  - Every single backend file, route, model, bridge, and test suite was inspected without skipping a single line.
  - **Uniform `asyncHandler` Controller Standardization:**
    - Created `backend/src/infrastructure/http/middleware/asyncHandler.js`.
    - Wrapped all controllers across the application (`authController`, `profileController`, `assetController`) with `asyncHandler`, eliminating repetitive and error-prone try/catch boilerplate.
  - **Server Bootstrap & Graceful Shutdown Lifecycle:**
    - `backend/src/server.js` now calls `await connectDB()` on direct server startup (`npm run start:api` / `npm run dev:api`).
    - Added `await disconnectDB()` in graceful shutdown signal handlers (`SIGTERM`, `SIGINT`).
    - Reset `isShuttingDown = false;` in `backend/src/infrastructure/database/connection.js` on explicit `connectDB()` calls to ensure seamless multi-suite test execution.
  - **Complete Compatibility Bridge Layer:**
    - Added `backend/src/controllers/assetController.js`, `backend/src/routes/assetRoutes.js`, and `backend/src/services/assetService.js`.
    - Added directory aliases: `modules/identity/persistence/` pointing to `modules/identity/domain/` and `modules/assets/domain/` pointing to `modules/assets/persistence/`.
  - **Session Query Invariant Alignment:**
    - Aligned all `Session.deleteMany` queries across `accountService.js` and `identity-suite.test.js` from legacy `{ user: userId }` to `{ userId }` matching the actual schema field name.
  - **Global vs Child CSRF Deduplication:**
    - Removed redundant route-level `csrfProtection` calls in `assetRoutes.js` because `app.js` mounts `csrfProtection` globally across all `/api/v1` routes.
  - **Granular Test Runner & High-Performance Test Setup:**
    - Preloaded test environment via `--import ./tests/setup.js` setting `NODE_ENV = 'test'` before any module evaluation.
    - Reduced bcrypt salt rounds to 4 during test runs, accelerating user hashing from 2,476ms to 19ms (130x speedup).
    - Added 11 granular test scripts to `package.json` (`test:health`, `test:identity-models`, `test:auth`, `test:security`, `test:crypto`, `test:identity-suite`, `test:storage`, `test:upload`, `test:parser`, `test:file`, `test:single`) while preserving `test:api`.
    - 104/104 tests passing across all 9 test suites in 73 seconds.

## 19. Asset Representation & Provenance Models (Task 3.4)
- **First-Class Representation Model (`modules/assets/persistence/AssetRepresentation.js`):**
  - Satisfies `FR-CORE-DOC-003` and Section 10.1 (Row 722): *"OCR/text/transcript/table extraction/chunk derivative, processor/provider version, source asset, page/section/time ranges, provenance."*
  - Automatically computes SHA-256 checksum and sizeBytes on pre-save hook for content tamper detection.
  - Implements atomic `upsertRepresentation` with modern `returnDocument: 'after'`.
  - Captures complete provenance:
    - Pipeline name (e.g. `'documentParser'`, `'spreadsheetTableParser'`, `'speechToText'`).
    - Engine identifier and version (e.g. `pdf-parse`, `mammoth`, `exceljs`, `plain-text`).
    - Cryptographic source asset checksum (`sourceChecksum`) binding derived content to the exact binary.
    - Page ranges (`startPage`, `endPage`, `totalPages`), sheet names, duration latency, and format metadata.
- **Physical Binary Purge & Representation Retention (Scenario M & `FR-CORE-DOC-003`):**
  - Addresses Scenario M: *"When the temporary upload buffer reaches retention expiry, background maintenance safely purges the binary file from disk while retaining the derived transcript/text representation for ongoing conversational reasoning."*
  - Implemented `purgeAssetBinary(assetId, userId)`:
    - Deletes physical file from private object storage.
    - Sets `hasBinaryPurged: true` and `binaryPurgedAt` on `Asset`.
    - Updates child representations with `isBinaryPurged: true`.
    - Keeps `Asset` metadata and `AssetRepresentation` content completely intact for AI context and conversational reasoning.
- **Durable Citation & Grounding Service (`modules/documents/provenance/citationService.js`):**
  - Creates immutable citations binding conversational assertions to source asset, representation, location (page, sheet, row, lineStart/lineEnd, timeOffsetSeconds), and snippet.
  - Implements `verifyCitationIntegrity(citation, asset)` ensuring citation checksum matches the authoritative asset checksum.
  - Formats human-readable citation labels for UI display (e.g., `Document.pdf (p. 3)`).
- **HTTP Endpoints & Data Isolation (`NFR-SEC-004`):**
  - `GET /api/v1/assets/:id/representations`: Returns all representations with provenance.
  - `GET /api/v1/assets/:id/representations/:type`: Returns specific representation.
  - `POST /api/v1/assets/:id/purge-binary`: Purges physical storage file while keeping representations intact.
  - `POST /api/v1/assets/:id/citations`: Creates an immutable citation.
  - All endpoints enforce strict user isolation: foreign or unauthorized requests receive uniform 404 `NOT_FOUND`.
  - Cascading soft-delete: deleting an asset marks both the `Asset` and all its `AssetRepresentation` documents as `isDeleted: true`.

## 20. Private Signed Download & Asset Lifecycle Reconciliation (Task 3.5)
- **Zero Static Public Exposure & Token-Governed Streaming Access (`FR-CORE-DOC-003`):**
  - Public static upload serving (`express.static('/uploads')`) remains strictly absent from the application composition.
  - Implemented `GET /api/v1/assets/:id/token`:
    - Issues an HMAC-SHA256 signed download token encoding `{ assetId, userId, expiresAt }`.
    - Protected by `requireUser` and user ownership validation (`assertUserOwnership`).
    - Configurable short-lived expiration (default 15 minutes, capped at 1 hour).
  - Implemented `GET /api/v1/assets/:id/download`:
    - Validates access via either:
      1. Signed HMAC token parameter (`?token=...`), verified with timing-safe comparison (`crypto.timingSafeEqual`) without requiring session cookies (ideal for embedded `<img src="..." />` tags or preview windows).
      2. Active session Bearer header or cookies via `optionalUser` fallback.
    - Directly streams private disk binary using `storageService.createReadStream`.
    - Emits defensive headers: `Content-Type`, `Content-Length`, `Content-Disposition` (inline or attachment), `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-transform`.
- **410 Gone on Purged Binaries (Scenario M):**
  - If physical storage binary has been purged via lifecycle or user action (`hasBinaryPurged: true`), both the token generator and download endpoint return HTTP 410 `GONE` with error code `BINARY_PURGED`.
  - Distinguishes permanently purged binaries from missing resources, while preserving derived text for conversational context.
- **Background Lifecycle Sweeper & Reconciliation Engine (`modules/assets/lifecycle/assetReconciliationService.js`):**
  - `reconcileExpiredAssets()`:
    - Scans for expired ephemeral/temporary assets (`expiresAt <= now` and `hasBinaryPurged: false`).
    - Purges raw physical storage files from disk while preserving the `Asset` metadata document and derived representations.
  - `reconcileOrphanedTempFiles(maxAgeMs)`:
    - Sweeps staging directory (`storage/private/temp`) for abandoned upload chunks older than threshold (default 1 hour) left by aborted or crashed multipart uploads (`Scenario O`).
    - Safely reclaims storage capacity with zero risk to verified persistent assets.

## 21. Phase 3 Asset & Document Foundation Acceptance Verification (Task 3.6)
- **Comprehensive End-to-End Acceptance (`tests/api/asset-document-suite.test.js`):**
  - Unifies all Phase 3 requirements under a single acceptance suite exercising the full stack:
    1. **Multi-Format Ingestion & MIME Defense:**
       - Authentic PDF, CSV, DOCX, XLSX, TXT, and Markdown uploads stored in private user partitions.
       - Disguised PE binaries rejected with 400 Bad Request (`EXECUTABLE_NOT_PERMITTED`).
    2. **Multi-Representation Derivation & Provenance:**
       - Extraction creates `extracted_text`, `spreadsheet_table`, and `text_preview` records.
       - Full processing provenance (`pipeline`, `engine`, `engineVersion`, `sourceChecksum`, `durationMs`, `pageRange`, `sheetNames`, `metadata`).
       - Durable citations bind conversational statements to cryptographic checksums.
    3. **Private Dual-Auth Streaming Downloads:**
       - HMAC-SHA256 short-lived download tokens issued and verified.
       - Direct binary streaming with defensive headers (`nosniff`, `private`, `inline`/`attachment`).
       - Tampered, mismatched, and expired tokens rejected with 401 UNAUTHENTICATED.
    4. **Strict Account Data Isolation (`NFR-SEC-004`):**
       - Cross-tenant probing returns uniform 404 `NOT_FOUND` across all 6 asset endpoints (`GET /:id`, `POST /:id/extract`, `GET /:id/representations`, `GET /:id/token`, `GET /:id/download`, `DELETE /:id`).
    5. **Scenario M Binary Purge with Conversation Continuity:**
       - Physical storage binary purged; download returns 410 Gone (`BINARY_PURGED`).
       - Derived text representations remain 100% available for ongoing chat turns and AI grounding context.
    6. **Lifecycle Sweeper & Reconciliation Engine (Scenario O):**
       - `reconcileExpiredAssets()` sweeps expired ephemeral files.
       - `reconcileOrphanedTempFiles()` sweeps abandoned upload chunks.
  - 10/10 acceptance tests passing.
  - Full regression: 136/136 tests passing across all 12 test suites.
  - Static analysis & build: 0 lint errors, 1,513 client modules transformed in 2.45s.
